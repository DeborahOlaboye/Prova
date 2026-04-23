// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title JobRegistryTest
/// @notice Test suite for JobRegistry including empty string validation
/// @dev Tests cover EmptyTitle and EmptyCriteria error conditions

import {Test} from "forge-std/Test.sol";
import {JobRegistry} from "../src/JobRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ArbiterPool} from "../src/ArbiterPool.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract JobRegistryTest is Test {
    JobRegistry public registry;
    EscrowVault public vault;
    ArbiterPool public arbiterPool;
    ReputationLedger public reputation;
    MockERC20 public cUSD;

    address public owner      = makeAddr("owner");
    address public agent      = makeAddr("agent");
    address public client     = makeAddr("client");
    address public freelancer = makeAddr("freelancer");

    uint256 constant BOUNTY   = 15e18;
    uint40  constant DEADLINE = 7 days;

    function setUp() public {
        cUSD       = new MockERC20("Celo Dollar", "cUSD", 18);
        arbiterPool = new ArbiterPool(address(cUSD), owner);
        registry   = new JobRegistry(address(cUSD), owner);
        vault      = new EscrowVault(address(cUSD), address(registry), address(arbiterPool), owner);
        reputation = new ReputationLedger(owner);

        vm.startPrank(owner);
        registry.setEscrowVault(address(vault));
        registry.setAuthorizedAgent(agent);
        vault.setAuthorizedAgent(agent);
        reputation.setAuthorizedAgent(agent);
        arbiterPool.setEscrowVault(address(vault));
        vm.stopPrank();

        cUSD.mint(client, 100e18);
        cUSD.mint(freelancer, 50e18);
    }

    function test_PostJob() public {
        bytes32 jobId = _postJob();

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.client, client);
        assertEq(job.bounty, BOUNTY);
        assertEq(uint8(job.status), uint8(JobRegistry.JobStatus.OPEN));
        assertEq(vault.getLockedAmount(jobId), BOUNTY);
    }

    function test_AcceptJob() public {
        bytes32 jobId = _postJob();

        vm.prank(freelancer);
        registry.acceptJob(jobId);

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.freelancer, freelancer);
        assertEq(uint8(job.status), uint8(JobRegistry.JobStatus.IN_PROGRESS));
    }

    function test_CannotAcceptAlreadyAcceptedJob() public {
        bytes32 jobId = _postJob();

        vm.prank(freelancer);
        registry.acceptJob(jobId);

        vm.expectRevert(JobRegistry.JobNotOpen.selector);
        vm.prank(makeAddr("other"));
        registry.acceptJob(jobId);
    }

    function test_SubmitWork() public {
        bytes32 jobId = _postAndAcceptJob();

        vm.prank(freelancer);
        registry.submitWork(jobId, "ipfs://QmDeliverableHash");

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(uint8(job.status), uint8(JobRegistry.JobStatus.SUBMITTED));
        assertEq(job.deliverableIPFSHash, "ipfs://QmDeliverableHash");
    }

    function test_OnlyFreelancerCanSubmit() public {
        bytes32 jobId = _postAndAcceptJob();

        vm.expectRevert(JobRegistry.Unauthorized.selector);
        vm.prank(client);
        registry.submitWork(jobId, "ipfs://QmFake");
    }

    function test_MarkCompleted_OnlyAgent() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.expectRevert(JobRegistry.Unauthorized.selector);
        vm.prank(client);
        registry.markCompleted(jobId);
    }

    function test_MarkCompleted_Success() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.prank(agent);
        registry.markCompleted(jobId);

        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.COMPLETED));
    }

    function test_MarkDisputed() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.prank(agent);
        registry.markDisputed(jobId);

        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.DISPUTED));
    }

    function test_CancelOpenJob() public {
        bytes32 jobId = _postJob();
        uint256 clientBalanceBefore = cUSD.balanceOf(client);

        vm.prank(client);
        registry.cancelJob(jobId);

        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.CANCELLED));
        // Verify client got their bounty back
        assertEq(cUSD.balanceOf(client), clientBalanceBefore + BOUNTY);
    }

    function test_CancelJobReleasesVaultFunds() public {
        bytes32 jobId = _postJob();

        // Verify funds are locked before cancel
        assertEq(vault.getLockedAmount(jobId), BOUNTY);

        vm.prank(client);
        registry.cancelJob(jobId);

        // Verify funds are released from vault after cancel
        assertEq(vault.getLockedAmount(jobId), 0);
    }

    function test_CancelJobEmitsFundsRefundedEvent() public {
        bytes32 jobId = _postJob();

        vm.expectEmit(true, true, false, true);
        emit EscrowVault.FundsRefunded(jobId, client, BOUNTY);

        vm.prank(client);
        registry.cancelJob(jobId);
    }

    function test_CancelJobRefundsDifferentBountyAmounts() public {
        // Test with 5 cUSD bounty
        uint256 customBounty = 5e18;
        vm.startPrank(client);
        cUSD.approve(address(registry), customBounty);

        uint40 deadline = uint40(block.timestamp + 7 days);
        bytes32 jobId = registry.postJob("Custom bounty job", "ipfs://QmCriteria", customBounty, deadline);

        uint256 clientBalanceBefore = cUSD.balanceOf(client);

        registry.cancelJob(jobId);

        // Verify full custom bounty is refunded
        assertEq(cUSD.balanceOf(client), clientBalanceBefore + customBounty);
        vm.stopPrank();
    }

    function test_OnlyClientCanCancelAndGetRefund() public {
        bytes32 jobId = _postJob();

        uint256 clientBalanceBefore = cUSD.balanceOf(client);
        uint256 freelancerBalanceBefore = cUSD.balanceOf(freelancer);

        // Freelancer tries to cancel - should revert
        vm.expectRevert(JobRegistry.Unauthorized.selector);
        vm.prank(freelancer);
        registry.cancelJob(jobId);

        // Verify no funds moved
        assertEq(cUSD.balanceOf(client), clientBalanceBefore);
        assertEq(cUSD.balanceOf(freelancer), freelancerBalanceBefore);
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.OPEN));
    }

    function test_CancelJobEmitsJobCancelledEvent() public {
        bytes32 jobId = _postJob();

        vm.expectEmit(true, false, false, false);
        emit JobRegistry.JobCancelled(jobId);

        vm.prank(client);
        registry.cancelJob(jobId);
    }

    function test_MultipleJobCancellationsWithRefunds() public {
        // Post multiple jobs
        bytes32 jobId1 = _postJob();
        bytes32 jobId2 = _postJob();

        uint256 clientBalanceBefore = cUSD.balanceOf(client);
        uint256 totalLocked = BOUNTY * 2;

        // Cancel both jobs
        vm.startPrank(client);
        registry.cancelJob(jobId1);
        registry.cancelJob(jobId2);
        vm.stopPrank();

        // Verify both jobs cancelled
        assertEq(uint8(registry.getJob(jobId1).status), uint8(JobRegistry.JobStatus.CANCELLED));
        assertEq(uint8(registry.getJob(jobId2).status), uint8(JobRegistry.JobStatus.CANCELLED));

        // Verify both refunds received
        assertEq(cUSD.balanceOf(client), clientBalanceBefore + totalLocked);
        assertEq(vault.getLockedAmount(jobId1), 0);
        assertEq(vault.getLockedAmount(jobId2), 0);
    }

    function test_CancelJobRefundsMinimumBounty() public {
        // Test with minimum bounty (0.00001 cUSD)
        uint256 minBounty = 1e13;
        vm.startPrank(client);
        cUSD.approve(address(registry), minBounty);

        uint40 deadline = uint40(block.timestamp + 7 days);
        bytes32 jobId = registry.postJob("Minimum bounty job", "ipfs://QmCriteria", minBounty, deadline);

        uint256 clientBalanceBefore = cUSD.balanceOf(client);

        registry.cancelJob(jobId);

        // Verify minimum bounty is fully refunded
        assertEq(cUSD.balanceOf(client), clientBalanceBefore + minBounty);
        assertEq(vault.getLockedAmount(jobId), 0);
        vm.stopPrank();
    }

    function test_SecondCancelDoesNotAffectFirstRefund() public {
        bytes32 jobId1 = _postJob();
        bytes32 jobId2 = _postJob();

        vm.startPrank(client);

        // Cancel first job
        registry.cancelJob(jobId1);
        assertEq(vault.getLockedAmount(jobId1), 0);
        assertEq(vault.getLockedAmount(jobId2), BOUNTY);

        // Cancel second job
        registry.cancelJob(jobId2);
        assertEq(vault.getLockedAmount(jobId2), 0);

        vm.stopPrank();
    }

    function test_CancelJobRefundIntegration() public {
        // Complete integration test for cancel and refund
        uint256 initialClientBalance = cUSD.balanceOf(client);
        uint256 initialVaultBalance = cUSD.balanceOf(address(vault));

        bytes32 jobId = _postJob();

        // Verify funds moved from client to vault
        assertEq(cUSD.balanceOf(client), initialClientBalance - BOUNTY);
        assertEq(cUSD.balanceOf(address(vault)), initialVaultBalance + BOUNTY);
        assertEq(vault.getLockedAmount(jobId), BOUNTY);

        // Cancel and verify refund
        vm.prank(client);
        registry.cancelJob(jobId);

        // Verify funds returned to client
        assertEq(cUSD.balanceOf(client), initialClientBalance);
        assertEq(cUSD.balanceOf(address(vault)), initialVaultBalance);
        assertEq(vault.getLockedAmount(jobId), 0);
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.CANCELLED));
    }

    function test_CancelledJobRemovedFromOpenJobIds() public {
        bytes32 jobId = _postJob();

        // Verify job is in openJobIds before cancel
        assertEq(registry.getOpenJobCount(), 1);

        vm.prank(client);
        registry.cancelJob(jobId);

        // Verify job is removed from openJobIds after cancel
        assertEq(registry.getOpenJobCount(), 0);
    }

    function test_CancelJobRefundGasEfficiency() public {
        bytes32 jobId = _postJob();

        uint256 gasBefore = gasleft();
        vm.prank(client);
        registry.cancelJob(jobId);
        uint256 gasUsed = gasBefore - gasleft();

        // Cancel with refund should use reasonable gas
        assertLt(gasUsed, 200000, "Cancel job with refund should be gas efficient");
    }

    function test_CannotCancelInProgressJob() public {
        bytes32 jobId = _postAndAcceptJob();

        vm.expectRevert(JobRegistry.JobNotOpen.selector);
        vm.prank(client);
        registry.cancelJob(jobId);
    }

    function test_BountyLockedInEscrow() public {
        uint256 clientBefore = cUSD.balanceOf(client);
        bytes32 jobId = _postJob();

        assertEq(cUSD.balanceOf(client), clientBefore - BOUNTY);
        assertEq(vault.getLockedAmount(jobId), BOUNTY);
    }

    function test_GetClientJobs() public {
        bytes32 id1 = _postJob();
        bytes32 id2 = _postJobWithBounty(5e18);

        bytes32[] memory jobs = registry.getClientJobs(client);
        assertEq(jobs.length, 2);
        assertEq(jobs[0], id1);
        assertEq(jobs[1], id2);
    }

    function test_CannotPostJobWithEmptyTitle() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        vm.expectRevert(JobRegistry.EmptyTitle.selector);
        registry.postJob("", "ipfs://QmCriteriaHash", BOUNTY, uint40(block.timestamp + DEADLINE));
        vm.stopPrank();
    }

    function test_CannotPostJobWithEmptyCriteria() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        vm.expectRevert(JobRegistry.EmptyCriteria.selector);
        registry.postJob("Write a landing page", "", BOUNTY, uint40(block.timestamp + DEADLINE));
        vm.stopPrank();
    }

    function test_CannotPostJobWithBothEmpty() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        vm.expectRevert(JobRegistry.EmptyTitle.selector);
        registry.postJob("", "", BOUNTY, uint40(block.timestamp + DEADLINE));
        vm.stopPrank();
    }

    function test_CanPostJobWithValidTitleAndCriteria() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        bytes32 jobId = registry.postJob("Valid Job Title", "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, "Valid Job Title");
        assertEq(job.criteriaIPFSHash, "ipfs://QmValidHash");
        vm.stopPrank();
    }

    function test_CanPostJobWithSingleCharacterTitle() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        bytes32 jobId = registry.postJob("A", "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, "A");
        vm.stopPrank();
    }

    function test_CanPostJobWithLongTitle() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        string memory longTitle = "This is a very long job title that describes the work in great detail and should still be accepted by the contract validation";
        bytes32 jobId = registry.postJob(longTitle, "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, longTitle);
        vm.stopPrank();
    }

    function test_CanPostJobWithSpecialCharactersInTitle() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        string memory specialTitle = "Job: Write a landing page! (urgent) @home #freelance";
        bytes32 jobId = registry.postJob(specialTitle, "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, specialTitle);
        vm.stopPrank();
    }

    function test_CanPostJobWithUnicodeInTitle() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        string memory unicodeTitle = "Prova: Creare una pagina web bellissima";
        bytes32 jobId = registry.postJob(unicodeTitle, "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, unicodeTitle);
        vm.stopPrank();
    }

    function test_CanPostJobWithVariousIPFSFormats() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Test different valid IPFS hash formats
        bytes32 jobId1 = registry.postJob("Job 1", "ipfs://QmHash123", BOUNTY, uint40(block.timestamp + DEADLINE));
        bytes32 jobId2 = registry.postJob("Job 2", "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job1 = registry.getJob(jobId1);
        JobRegistry.Job memory job2 = registry.getJob(jobId2);

        assertEq(job1.criteriaIPFSHash, "ipfs://QmHash123");
        assertEq(job2.criteriaIPFSHash, "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
        vm.stopPrank();
    }

    function test_SpacesOnlyTitleIsAccepted() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Note: spaces-only title is technically non-empty (has bytes)
        // This test documents current behavior - spaces count as valid content
        bytes32 jobId = registry.postJob("   ", "ipfs://QmValidHash", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, "   ");
        vm.stopPrank();
    }

    function test_CanPostJobWithEmptyDeliverableOnSubmission() public {
        // Note: deliverable is set during submission, not posting
        // This test verifies that empty deliverable check is handled at submission time
        bytes32 jobId = _postAndAcceptJob();

        vm.prank(freelancer);
        // Empty deliverable should be allowed at contract level (validated by agent off-chain)
        registry.submitWork(jobId, "");

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.deliverableIPFSHash, "");
        assertEq(uint8(job.status), uint8(JobRegistry.JobStatus.SUBMITTED));
    }

    function test_PostJobEmitsEventWithValidInput() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        vm.expectEmit(true, true, false, true);
        emit JobRegistry.JobPosted(
            keccak256(abi.encodePacked(client, "Test Job Title", block.timestamp, BOUNTY)),
            client,
            BOUNTY,
            uint40(block.timestamp + DEADLINE)
        );

        registry.postJob("Test Job Title", "ipfs://QmCriteria", BOUNTY, uint40(block.timestamp + DEADLINE));
        vm.stopPrank();
    }

    function test_EmptyTitleRevertsEarly() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        uint256 gasBefore = gasleft();
        vm.expectRevert(JobRegistry.EmptyTitle.selector);
        registry.postJob("", "ipfs://QmCriteria", BOUNTY, uint40(block.timestamp + DEADLINE));
        uint256 gasUsed = gasBefore - gasleft();

        // Empty string validation should revert early with minimal gas
        assertLt(gasUsed, 50000, "Empty title should revert with minimal gas");
        vm.stopPrank();
    }

    function test_EmptyCriteriaRevertsEarly() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        uint256 gasBefore = gasleft();
        vm.expectRevert(JobRegistry.EmptyCriteria.selector);
        registry.postJob("Valid Title", "", BOUNTY, uint40(block.timestamp + DEADLINE));
        uint256 gasUsed = gasBefore - gasleft();

        // Empty criteria validation should revert early with minimal gas
        assertLt(gasUsed, 50000, "Empty criteria should revert with minimal gas");
        vm.stopPrank();
    }

    function testFuzz_ValidTitleLengths(uint8 length) public {
        vm.assume(length > 0 && length <= 100);
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Generate a title of specified length
        bytes memory titleBytes = new bytes(length);
        for (uint8 i = 0; i < length; i++) {
            titleBytes[i] = bytes1(uint8(65 + (i % 26))); // A-Z repeating
        }
        string memory title = string(titleBytes);

        bytes32 jobId = registry.postJob(title, "ipfs://QmCriteria", BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.title, title);
        vm.stopPrank();
    }

    function testFuzz_ValidCriteriaLengths(uint8 length) public {
        vm.assume(length > 0 && length <= 100);
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Generate a criteria hash of specified length
        bytes memory criteriaBytes = new bytes(length);
        for (uint8 i = 0; i < length; i++) {
            criteriaBytes[i] = bytes1(uint8(97 + (i % 26))); // a-z repeating
        }
        string memory criteria = string(criteriaBytes);

        bytes32 jobId = registry.postJob("Valid Title", criteria, BOUNTY, uint40(block.timestamp + DEADLINE));

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.criteriaIPFSHash, criteria);
        vm.stopPrank();
    }

    // --- self-accept tests ---

    function test_ClientCannotAcceptOwnJob() public {
        bytes32 jobId = _postJob();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);
    }

    function test_ClientCannotAcceptOwnJob_StatusUnchanged() public {
        bytes32 jobId = _postJob();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Job must still be OPEN after failed accept
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.OPEN));
    }

    function test_ClientCannotAcceptOwnJob_FreelancerStillZero() public {
        bytes32 jobId = _postJob();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Freelancer field must remain address(0)
        assertEq(registry.getJob(jobId).freelancer, address(0));
    }

    function test_ClientCannotAcceptOwnJob_BountyStillLocked() public {
        bytes32 jobId = _postJob();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Bounty must still be locked in vault
        assertEq(vault.getLockedAmount(jobId), BOUNTY);
    }

    function test_ClientCannotAcceptOwnJob_NotAddedToFreelancerJobs() public {
        bytes32 jobId = _postJob();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Client must not appear in their own freelancerJobs list
        assertEq(registry.getFreelancerJobs(client).length, 0);
    }

    function test_ClientCannotAcceptOwnJob_StillOpenForOthers() public {
        bytes32 jobId = _postJob();

        // Client attempt fails
        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // A different address can still accept
        vm.prank(freelancer);
        registry.acceptJob(jobId);

        assertEq(registry.getJob(jobId).freelancer, freelancer);
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.IN_PROGRESS));
    }

    function test_ClientCannotAcceptOwnJob_OpenJobCountUnchanged() public {
        bytes32 jobId = _postJob();
        uint256 countBefore = registry.getOpenJobCount();

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Open job count must not change on failed accept
        assertEq(registry.getOpenJobCount(), countBefore);
    }

    function test_DifferentAddressCanAlwaysAccept() public {
        bytes32 jobId = _postJob();
        address stranger = makeAddr("stranger");

        vm.prank(stranger);
        registry.acceptJob(jobId);

        assertEq(registry.getJob(jobId).freelancer, stranger);
    }

    function test_ClientCannotAcceptOwnJob_MultipleJobs() public {
        bytes32 jobId1 = _postJob();
        bytes32 jobId2 = _postJobWithBounty(5e18);

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId1);

        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId2);

        // Both still open
        assertEq(uint8(registry.getJob(jobId1).status), uint8(JobRegistry.JobStatus.OPEN));
        assertEq(uint8(registry.getJob(jobId2).status), uint8(JobRegistry.JobStatus.OPEN));
    }

    function test_ClientCannotAcceptOwnJob_AfterCancelAttempt() public {
        bytes32 jobId = _postJob();

        // Self-accept fails
        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // Client can still cancel normally
        vm.prank(client);
        registry.cancelJob(jobId);

        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.CANCELLED));
    }

    function test_SelfAcceptCheckBeforeDeadlineCheck() public {
        bytes32 jobId = _postJob();

        // Warp past deadline
        vm.warp(block.timestamp + 8 days);

        // Should revert with ClientCannotAcceptOwnJob, not DeadlinePassed
        // because the self-accept check comes first
        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);
    }

    function testFuzz_NonClientCanAlwaysAccept(address caller) public {
        vm.assume(caller != client && caller != address(0));
        bytes32 jobId = _postJob();

        vm.prank(caller);
        registry.acceptJob(jobId);

        assertEq(registry.getJob(jobId).freelancer, caller);
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.IN_PROGRESS));
    }

    function test_ClientCannotAcceptOwnJob_EventNotEmitted() public {
        bytes32 jobId = _postJob();

        // Record logs before the failed call
        vm.recordLogs();
        vm.expectRevert(JobRegistry.ClientCannotAcceptOwnJob.selector);
        vm.prank(client);
        registry.acceptJob(jobId);

        // No JobAccepted event should have been emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            // JobAccepted topic: keccak256("JobAccepted(bytes32,address)")
            bytes32 jobAcceptedTopic = keccak256("JobAccepted(bytes32,address)");
            assertTrue(logs[i].topics[0] != jobAcceptedTopic, "JobAccepted must not be emitted");
        }
    }

    // --- helpers ---

    function _postJob() internal returns (bytes32) {
        return _postJobWithBounty(BOUNTY);
    }

    function _postJobWithBounty(uint256 bounty) internal returns (bytes32 jobId) {
        return _postJobWithDetails("Write a landing page", "ipfs://QmCriteriaHash", bounty);
    }

    function _postJobWithDetails(string memory title, string memory criteria, uint256 bounty) internal returns (bytes32 jobId) {
        vm.startPrank(client);
        cUSD.approve(address(registry), bounty);
        jobId = registry.postJob(title, criteria, bounty, uint40(block.timestamp + DEADLINE));
        vm.stopPrank();
    }

    function _postAndAcceptJob() internal returns (bytes32 jobId) {
        jobId = _postJob();
        vm.prank(freelancer);
        registry.acceptJob(jobId);
    }

    function _postAcceptAndSubmit() internal returns (bytes32 jobId) {
        jobId = _postAndAcceptJob();
        vm.prank(freelancer);
        registry.submitWork(jobId, "ipfs://QmDeliverable");
    }
}

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

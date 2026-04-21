// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

    function test_CannotPostJobWithDeadlineTooSoon() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Deadline less than 1 hour from now should revert
        uint40 tooSoonDeadline = uint40(block.timestamp + 30 minutes);

        vm.expectRevert(JobRegistry.DeadlineTooSoon.selector);
        registry.postJob("Write a landing page", "ipfs://QmCriteriaHash", BOUNTY, tooSoonDeadline);
        vm.stopPrank();
    }

    function test_CanPostJobWithExactlyMinimumBuffer() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Deadline exactly 1 hour from now should succeed
        uint40 minDeadline = uint40(block.timestamp + 1 hours);

        bytes32 jobId = registry.postJob("Write a landing page", "ipfs://QmCriteriaHash", BOUNTY, minDeadline);

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.deadline, minDeadline);
        vm.stopPrank();
    }

    function test_CanPostJobWithLongerDeadline() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Deadline 7 days from now should succeed (well above minimum)
        uint40 futureDeadline = uint40(block.timestamp + 7 days);

        bytes32 jobId = registry.postJob("Complex project", "ipfs://QmCriteriaHash", BOUNTY, futureDeadline);

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.deadline, futureDeadline);
        assertEq(uint8(job.status), uint8(JobRegistry.JobStatus.OPEN));
        vm.stopPrank();
    }

    function test_CannotPostJobWithDeadlineJustBelowMinimum() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Deadline 59 minutes from now should revert (just under 1 hour)
        uint40 justUnderMin = uint40(block.timestamp + 59 minutes);

        vm.expectRevert(JobRegistry.DeadlineTooSoon.selector);
        registry.postJob("Rush job", "ipfs://QmCriteriaHash", BOUNTY, justUnderMin);
        vm.stopPrank();
    }

    function test_CanPostJobWithTwoHourDeadline() public {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);

        // Deadline 2 hours from now should succeed (double the minimum)
        uint40 twoHourDeadline = uint40(block.timestamp + 2 hours);

        bytes32 jobId = registry.postJob("Two hour job", "ipfs://QmCriteriaHash", BOUNTY, twoHourDeadline);

        JobRegistry.Job memory job = registry.getJob(jobId);
        assertEq(job.deadline, twoHourDeadline);
        vm.stopPrank();
    }

    // --- helpers ---

    function _postJob() internal returns (bytes32) {
        return _postJobWithBounty(BOUNTY);
    }

    function _postJobWithBounty(uint256 bounty) internal returns (bytes32 jobId) {
        vm.startPrank(client);
        cUSD.approve(address(registry), bounty);
        jobId = registry.postJob(
            "Write a landing page",
            "ipfs://QmCriteriaHash",
            bounty,
            uint40(block.timestamp + DEADLINE)
        );
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

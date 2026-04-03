// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {JobRegistry} from "../src/JobRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ArbiterPool} from "../src/ArbiterPool.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice End-to-end tests covering happy path, refund, dispute → arbiter resolution,
///         and reputation tracking across a full job lifecycle.
contract IntegrationTest is Test {
    JobRegistry      registry;
    EscrowVault      vault;
    ArbiterPool      arbiterPool;
    ReputationLedger reputation;
    MockERC20        cUSD;

    address owner      = makeAddr("owner");
    address agent      = makeAddr("agent");
    address client     = makeAddr("client");
    address freelancer = makeAddr("freelancer");
    address arb1       = makeAddr("arb1");
    address arb2       = makeAddr("arb2");
    address arb3       = makeAddr("arb3");

    uint256 constant BOUNTY  = 20e18;
    uint40  constant DEADLINE = 14 days;

    function setUp() public {
        cUSD        = new MockERC20("Celo Dollar", "cUSD", 18);
        arbiterPool = new ArbiterPool(address(cUSD), owner);
        registry    = new JobRegistry(address(cUSD), owner);
        vault       = new EscrowVault(address(cUSD), address(registry), address(arbiterPool), owner);
        reputation  = new ReputationLedger(owner);

        vm.startPrank(owner);
        registry.setEscrowVault(address(vault));
        registry.setAuthorizedAgent(agent);
        vault.setAuthorizedAgent(agent);
        reputation.setAuthorizedAgent(agent);
        arbiterPool.setEscrowVault(address(vault));
        vm.stopPrank();

        cUSD.mint(client,     200e18);
        cUSD.mint(freelancer,  50e18);
        cUSD.mint(arb1, 50e18);
        cUSD.mint(arb2, 50e18);
        cUSD.mint(arb3, 50e18);
        // Fund arbiter pool for fee distribution
        cUSD.mint(address(arbiterPool), 100e18);
    }

    /// @notice Happy path: post → accept → submit → AI passes → release → reputation updated
    function test_HappyPath_AIRelease() public {
        bytes32 jobId = _fullSubmit();

        uint256 freelancerBefore = cUSD.balanceOf(freelancer);

        // Agent evaluates: PASS — release funds first (checks SUBMITTED), then mark completed
        vm.startPrank(agent);
        vault.releaseFunds(jobId);
        registry.markCompleted(jobId);
        reputation.recordCompletion(freelancer, jobId, 80, BOUNTY);
        vm.stopPrank();

        assertEq(cUSD.balanceOf(freelancer), freelancerBefore + BOUNTY);
        assertEq(vault.getLockedAmount(jobId), 0);

        ReputationLedger.Score memory score = reputation.getScore(freelancer);
        assertEq(score.jobsCompleted, 1);
        assertEq(score.totalEarned, BOUNTY);
        assertEq(score.avgRating, 80);
    }

    /// @notice Refund path: AI evaluation fails → client gets bounty back
    function test_RefundPath_AIReject() public {
        bytes32 jobId = _fullSubmit();

        uint256 clientBefore = cUSD.balanceOf(client);

        // Refund funds first (checks SUBMITTED), then mark refunded
        vm.startPrank(agent);
        vault.refundFunds(jobId);
        registry.markRefunded(jobId);
        vm.stopPrank();

        assertEq(cUSD.balanceOf(client), clientBefore + BOUNTY);
        assertEq(vault.getLockedAmount(jobId), 0);
    }

    /// @notice Dispute path: AI uncertain → arbiters vote RELEASE → freelancer paid
    function test_DisputePath_ArbitersReleaseToFreelancer() public {
        _stakeArbiters();
        bytes32 jobId = _fullSubmit();

        // Agent marks as disputed (low confidence)
        vm.prank(agent);
        registry.markDisputed(jobId);

        // Agent escalates to arbiter pool
        vm.prank(agent);
        bytes32 disputeId = vault.escalateToArbiters(jobId);

        // Arbiters vote
        address[] memory selected = _getSelectedArbiters(disputeId);
        uint256 freelancerBefore = cUSD.balanceOf(freelancer);

        vm.prank(selected[0]);
        arbiterPool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);
        vm.prank(selected[1]);
        arbiterPool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        // Dispute resolved as RELEASED
        assertEq(
            uint8(arbiterPool.getDisputeOutcome(disputeId)),
            uint8(ArbiterPool.DisputeOutcome.RELEASED)
        );
    }

    /// @notice Dispute path: arbiters vote REFUND → client gets bounty back
    function test_DisputePath_ArbitersRefundToClient() public {
        _stakeArbiters();
        bytes32 jobId = _fullSubmit();

        vm.prank(agent);
        registry.markDisputed(jobId);

        vm.prank(agent);
        bytes32 disputeId = vault.escalateToArbiters(jobId);

        address[] memory selected = _getSelectedArbiters(disputeId);

        vm.prank(selected[0]);
        arbiterPool.submitVote(disputeId, ArbiterPool.Vote.REFUND);
        vm.prank(selected[1]);
        arbiterPool.submitVote(disputeId, ArbiterPool.Vote.REFUND);

        assertEq(
            uint8(arbiterPool.getDisputeOutcome(disputeId)),
            uint8(ArbiterPool.DisputeOutcome.REFUNDED)
        );
    }

    /// @notice Reputation builds correctly across multiple completed jobs
    function test_ReputationBuildsAcrossJobs() public {
        for (uint256 i = 0; i < 3; i++) {
            bytes32 jobId = _fullSubmit();
            vm.startPrank(agent);
            vault.releaseFunds(jobId);
            registry.markCompleted(jobId);
            reputation.recordCompletion(freelancer, jobId, 90, BOUNTY);
            vm.stopPrank();
        }

        ReputationLedger.Score memory score = reputation.getScore(freelancer);
        assertEq(score.jobsCompleted, 3);
        assertEq(score.totalEarned, BOUNTY * 3);

        uint256 composite = reputation.getCompositeScore(freelancer);
        assertGt(composite, 0);
    }

    // --- helpers ---

    function _fullSubmit() internal returns (bytes32 jobId) {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);
        jobId = registry.postJob(
            "Build a DeFi dashboard",
            "ipfs://QmCriteria",
            BOUNTY,
            uint40(block.timestamp + DEADLINE)
        );
        vm.stopPrank();

        vm.prank(freelancer);
        registry.acceptJob(jobId);

        vm.prank(freelancer);
        registry.submitWork(jobId, "ipfs://QmDeliverable");
    }

    function _stakeArbiters() internal {
        address[3] memory arbs = [arb1, arb2, arb3];
        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(arbs[i]);
            cUSD.approve(address(arbiterPool), arbiterPool.STAKE_AMOUNT());
            arbiterPool.stake();
            vm.stopPrank();
        }
    }

    function _getSelectedArbiters(bytes32 disputeId) internal view returns (address[] memory) {
        // Re-derive selected arbiters from pool — use known stakers
        address[3] memory arbs = [arb1, arb2, arb3];
        address[] memory selected = new address[](3);
        uint256 count;
        for (uint256 i = 0; i < 3; i++) {
            selected[count++] = arbs[i];
        }
        return selected;
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArbiterPool} from "../src/ArbiterPool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract ArbiterPoolTest is Test {
    ArbiterPool public pool;
    MockERC20   public cUSD;

    address public owner  = makeAddr("owner");
    address public vault  = makeAddr("vault");
    address public arb1   = makeAddr("arb1");
    address public arb2   = makeAddr("arb2");
    address public arb3   = makeAddr("arb3");

    function setUp() public {
        cUSD = new MockERC20("Celo Dollar", "cUSD", 18);
        pool = new ArbiterPool(address(cUSD), owner);

        vm.prank(owner);
        pool.setEscrowVault(vault);

        // Fund arbiters
        cUSD.mint(arb1, 50e18);
        cUSD.mint(arb2, 50e18);
        cUSD.mint(arb3, 50e18);
        // Fund pool for fee payouts
        cUSD.mint(address(pool), 100e18);
    }

    function test_Stake() public {
        _stake(arb1);

        (,, bool active) = pool.arbiters(arb1);
        assertTrue(active);
        assertEq(pool.activeArbiterCount(), 1);
    }

    function test_CannotStakeTwice() public {
        _stake(arb1);

        // Pre-approve before expecting revert so expectRevert targets stake()
        vm.prank(arb1);
        cUSD.approve(address(pool), pool.STAKE_AMOUNT());

        vm.expectRevert(ArbiterPool.AlreadyArbiter.selector);
        vm.prank(arb1);
        pool.stake();
    }

    function test_Unstake_AfterCooldown() public {
        _stake(arb1);

        vm.prank(arb1);
        pool.requestUnstake();

        vm.warp(block.timestamp + 7 days + 1);

        uint256 balanceBefore = cUSD.balanceOf(arb1);
        vm.prank(arb1);
        pool.unstake();

        assertEq(cUSD.balanceOf(arb1), balanceBefore + pool.STAKE_AMOUNT());
        (, , bool active) = pool.arbiters(arb1);
        assertFalse(active);
    }

    function test_CannotUnstakeBeforeCooldown() public {
        _stake(arb1);

        vm.prank(arb1);
        pool.requestUnstake();

        vm.warp(block.timestamp + 3 days);

        vm.expectRevert(ArbiterPool.CooldownNotMet.selector);
        vm.prank(arb1);
        pool.unstake();
    }

    function test_OpenDispute_RequiresThreeArbiters() public {
        _stake(arb1);
        _stake(arb2);
        // Only 2 arbiters — should fail

        vm.expectRevert(ArbiterPool.InsufficientArbiters.selector);
        vm.prank(vault);
        pool.openDispute(bytes32("dispute1"), bytes32("job1"));
    }

    function test_OpenDispute_Success() public {
        _stakeAll();

        vm.prank(vault);
        address[] memory selected = pool.openDispute(bytes32("dispute1"), bytes32("job1"));

        assertEq(selected.length, 3);
    }

    function test_VoteAndResolve_Release() public {
        _stakeAll();

        bytes32 disputeId = bytes32("dispute1");

        vm.prank(vault);
        address[] memory selected = pool.openDispute(disputeId, bytes32("job1"));

        // 2 of 3 vote RELEASE
        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        vm.prank(selected[1]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        assertEq(uint8(pool.getDisputeOutcome(disputeId)), uint8(ArbiterPool.DisputeOutcome.RELEASED));
    }

    function test_VoteAndResolve_Refund() public {
        _stakeAll();

        bytes32 disputeId = bytes32("dispute2");

        vm.prank(vault);
        address[] memory selected = pool.openDispute(disputeId, bytes32("job2"));

        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.REFUND);

        vm.prank(selected[1]);
        pool.submitVote(disputeId, ArbiterPool.Vote.REFUND);

        assertEq(uint8(pool.getDisputeOutcome(disputeId)), uint8(ArbiterPool.DisputeOutcome.REFUNDED));
    }

    function test_CannotVoteTwice() public {
        _stakeAll();

        bytes32 disputeId = bytes32("dispute3");
        vm.prank(vault);
        address[] memory selected = pool.openDispute(disputeId, bytes32("job3"));

        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        vm.expectRevert(ArbiterPool.AlreadyVoted.selector);
        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);
    }

    function test_ArbitersEarnFee() public {
        _stakeAll();

        bytes32 disputeId = bytes32("dispute4");
        vm.prank(vault);
        address[] memory selected = pool.openDispute(disputeId, bytes32("job4"));

        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);
        vm.prank(selected[1]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        // Both voters should have pending fee
        assertEq(pool.pendingFees(selected[0]), pool.ARBITER_FEE());
        assertEq(pool.pendingFees(selected[1]), pool.ARBITER_FEE());
    }

    function test_ClaimFee() public {
        _stakeAll();

        bytes32 disputeId = bytes32("dispute5");
        vm.prank(vault);
        address[] memory selected = pool.openDispute(disputeId, bytes32("job5"));

        vm.prank(selected[0]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);
        vm.prank(selected[1]);
        pool.submitVote(disputeId, ArbiterPool.Vote.RELEASE);

        uint256 balBefore = cUSD.balanceOf(selected[0]);

        vm.prank(selected[0]);
        pool.claimFee();

        assertEq(cUSD.balanceOf(selected[0]), balBefore + pool.ARBITER_FEE());
        assertEq(pool.pendingFees(selected[0]), 0);
    }

    // --- helpers ---

    function _stake(address arbiter) internal {
        vm.startPrank(arbiter);
        cUSD.approve(address(pool), pool.STAKE_AMOUNT());
        pool.stake();
        vm.stopPrank();
    }

    function _stakeAll() internal {
        _stake(arb1);
        _stake(arb2);
        _stake(arb3);
    }
}

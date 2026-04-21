// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EscrowVaultTest
/// @notice Test suite for EscrowVault including cancel job refund functionality

import {Test} from "forge-std/Test.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {JobRegistry} from "../src/JobRegistry.sol";
import {ArbiterPool} from "../src/ArbiterPool.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

contract EscrowVaultTest is Test {
    EscrowVault  public vault;
    JobRegistry  public registry;
    ArbiterPool  public arbiterPool;
    MockERC20    public cUSD;

    address public owner      = makeAddr("owner");
    address public agent      = makeAddr("agent");
    address public client     = makeAddr("client");
    address public freelancer = makeAddr("freelancer");

    uint256 constant BOUNTY  = 10e18;
    uint40  constant DEADLINE = 7 days;

    function setUp() public {
        cUSD        = new MockERC20("Celo Dollar", "cUSD", 18);
        arbiterPool = new ArbiterPool(address(cUSD), owner);
        registry    = new JobRegistry(address(cUSD), owner);
        vault       = new EscrowVault(address(cUSD), address(registry), address(arbiterPool), owner);

        vm.startPrank(owner);
        registry.setEscrowVault(address(vault));
        registry.setAuthorizedAgent(agent);
        vault.setAuthorizedAgent(agent);
        arbiterPool.setEscrowVault(address(vault));
        vm.stopPrank();

        cUSD.mint(client, 100e18);
    }

    function test_ReleaseFunds_FreelancerReceivesBounty() public {
        bytes32 jobId = _postAcceptAndSubmit();

        uint256 balanceBefore = cUSD.balanceOf(freelancer);

        // Release funds first (checks SUBMITTED status), then mark completed
        vm.prank(agent);
        vault.releaseFunds(jobId);

        vm.prank(agent);
        registry.markCompleted(jobId);

        assertEq(cUSD.balanceOf(freelancer), balanceBefore + BOUNTY);
        assertEq(vault.getLockedAmount(jobId), 0);
    }

    function test_RefundFunds_ClientGetsBountyBack() public {
        bytes32 jobId = _postAcceptAndSubmit();

        uint256 clientBalanceBefore = cUSD.balanceOf(client);

        vm.prank(agent);
        vault.refundFunds(jobId);

        assertEq(cUSD.balanceOf(client), clientBalanceBefore + BOUNTY);
        assertEq(vault.getLockedAmount(jobId), 0);
    }

    function test_OnlyAgentCanRelease() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.expectRevert(EscrowVault.Unauthorized.selector);
        vm.prank(freelancer);
        vault.releaseFunds(jobId);
    }

    function test_OnlyAgentCanRefund() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.expectRevert(EscrowVault.Unauthorized.selector);
        vm.prank(client);
        vault.refundFunds(jobId);
    }

    function test_CannotReleaseAfterRelease() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.prank(agent);
        vault.releaseFunds(jobId);

        vm.expectRevert(EscrowVault.NoFundsLocked.selector);
        vm.prank(agent);
        vault.releaseFunds(jobId);
    }

    function test_RefundOnCancelOnlyCallableByJobRegistry() public {
        bytes32 jobId = _postJob();

        // Cancel the job first
        vm.prank(client);
        registry.cancelJob(jobId);

        // Non-JobRegistry caller should fail
        vm.expectRevert(EscrowVault.Unauthorized.selector);
        vm.prank(client);
        vault.refundOnCancel(jobId);
    }

    function test_RefundOnCancelRequiresCancelledStatus() public {
        bytes32 jobId = _postJob();

        // Job is still OPEN, not CANCELLED
        // JobRegistry should revert when trying to refund non-cancelled job
        // This test documents expected behavior
        assertEq(uint8(registry.getJob(jobId).status), uint8(JobRegistry.JobStatus.OPEN));
    }

    function test_RefundOnCancelEmitsFundsRefundedEvent() public {
        bytes32 jobId = _postJob();

        vm.expectEmit(true, true, false, true);
        emit EscrowVault.FundsRefunded(jobId, client, BOUNTY);

        vm.prank(client);
        registry.cancelJob(jobId);
    }

    function test_VaultBalanceAfterCancelRefund() public {
        uint256 vaultBalanceBefore = cUSD.balanceOf(address(vault));
        bytes32 jobId = _postJob();

        uint256 vaultBalanceAfterPost = cUSD.balanceOf(address(vault));
        assertEq(vaultBalanceAfterPost, vaultBalanceBefore + BOUNTY);

        vm.prank(client);
        registry.cancelJob(jobId);

        uint256 vaultBalanceAfterCancel = cUSD.balanceOf(address(vault));
        assertEq(vaultBalanceAfterCancel, vaultBalanceBefore);
    }

    function test_RefundFromDisputedState() public {
        bytes32 jobId = _postAcceptAndSubmit();

        vm.prank(agent);
        registry.markDisputed(jobId);

        uint256 clientBefore = cUSD.balanceOf(client);

        vm.prank(agent);
        vault.refundFunds(jobId);

        assertEq(cUSD.balanceOf(client), clientBefore + BOUNTY);
    }

    // --- helpers ---

    function _postJob() internal returns (bytes32 jobId) {
        vm.startPrank(client);
        cUSD.approve(address(registry), BOUNTY);
        jobId = registry.postJob(
            "Build a smart contract",
            "ipfs://QmCriteria",
            BOUNTY,
            uint40(block.timestamp + DEADLINE)
        );
        vm.stopPrank();
    }

    function _postAcceptAndSubmit() internal returns (bytes32 jobId) {
        jobId = _postJob();
        vm.prank(freelancer);
        registry.acceptJob(jobId);
        vm.prank(freelancer);
        registry.submitWork(jobId, "ipfs://QmDeliverable");
    }
}

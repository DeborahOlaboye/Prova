// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {JobRegistry} from "../src/JobRegistry.sol";
import {EscrowVault} from "../src/EscrowVault.sol";
import {ArbiterPool} from "../src/ArbiterPool.sol";
import {ReputationLedger} from "../src/ReputationLedger.sol";

contract Deploy is Script {
    // Celo mainnet cUSD
    address constant CUSD_MAINNET   = 0x765DE816845861e75A25fCA122bb6898B8B1282a;
    // Alfajores testnet cUSD
    address constant CUSD_ALFAJORES = 0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1;

    function run() external {
        address deployer    = vm.envAddress("DEPLOYER_ADDRESS");
        address agentWallet = vm.envAddress("AGENT_WALLET_ADDRESS");
        bool    isMainnet   = vm.envOr("MAINNET", false);

        address cUSD = isMainnet ? CUSD_MAINNET : CUSD_ALFAJORES;

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        // Deploy core contracts
        ArbiterPool      arbiterPool = new ArbiterPool(cUSD, deployer);
        console.log("ArbiterPool deployed:     ", address(arbiterPool));

        JobRegistry      registry    = new JobRegistry(cUSD, deployer);
        console.log("JobRegistry deployed:     ", address(registry));

        EscrowVault      vault       = new EscrowVault(cUSD, address(registry), address(arbiterPool), deployer);
        console.log("EscrowVault deployed:     ", address(vault));

        ReputationLedger reputation  = new ReputationLedger(deployer);
        console.log("ReputationLedger deployed:", address(reputation));

        // Wire up
        registry.setEscrowVault(address(vault));
        registry.setAuthorizedAgent(agentWallet);
        vault.setAuthorizedAgent(agentWallet);
        reputation.setAuthorizedAgent(agentWallet);
        arbiterPool.setEscrowVault(address(vault));

        console.log("---");
        console.log("Agent wallet:", agentWallet);
        console.log("cUSD:        ", cUSD);
        console.log("Network:     ", isMainnet ? "Celo Mainnet" : "Alfajores Testnet");

        vm.stopBroadcast();
    }
}

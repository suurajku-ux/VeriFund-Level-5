#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, BytesN, Env, String, Vec, IntoVal
};

fn setup_test(env: &Env) -> (VeriFundContractClient, Address, token::Client, token::StellarAssetClient) {
    let contract_id = env.register_contract(None, VeriFundContract);
    let client = VeriFundContractClient::new(&env, &contract_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    client.initialize(&token_id);

    (client, token_id, token_client, token_admin_client)
}

#[test]
fn test_create_campaign_valid_milestones() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _, _) = setup_test(&env);
    let creator = Address::generate(&env);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Surgery Advance"),
        amount: 300,
        proof_submitted: false,
        released: false,
    });
    milestones.push_back(Milestone {
        milestone_id: 2,
        title: String::from_str(&env, "Post-op Meds"),
        amount: 700,
        proof_submitted: false,
        released: false,
    });

    // Valid milestones sum up to goal (1000)
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);
    assert_eq!(campaign_id, 1);

    // Get campaign details and assert
    let campaign = client.get_campaign(&1);
    assert_eq!(campaign.goal_amount, 1000);
    assert_eq!(campaign.deadline, 2000);
    assert_eq!(campaign.milestones.len(), 2);
}

#[test]
fn test_create_campaign_invalid_milestones_sum() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _, _) = setup_test(&env);
    let creator = Address::generate(&env);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Surgery Advance"),
        amount: 300,
        proof_submitted: false,
        released: false,
    });
    milestones.push_back(Milestone {
        milestone_id: 2,
        title: String::from_str(&env, "Post-op Meds"),
        amount: 500, // 300 + 500 = 800 (does not sum to goal of 1000)
        proof_submitted: false,
        released: false,
    });

    let result = client.try_create_campaign(&creator, &1000, &2000, &milestones);
    assert!(result.is_err());
}

#[test]
fn test_successful_contribution_tracking() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, token_id, token_client, token_admin) = setup_test(&env);
    let creator = Address::generate(&env);
    let backer = Address::generate(&env);

    // Mint tokens to backer
    token_admin.mint(&backer, &2000);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Surgery Advance"),
        amount: 1000,
        proof_submitted: false,
        released: false,
    });
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    // Contribute
    client.contribute(&campaign_id, &backer, &400);

    // Verify backer contribution tracking
    let contrib = client.get_backer_contribution(&campaign_id, &backer);
    assert_eq!(contrib, 400);

    // Verify contract escrow balance
    let contract_balance = token_client.balance(&client.address);
    assert_eq!(contract_balance, 400);

    // Verify total raised in campaign
    let campaign = client.get_campaign(&campaign_id);
    assert_eq!(campaign.total_raised, 400);
}

#[test]
fn test_release_milestone_fails_if_no_proof() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _, token_admin) = setup_test(&env);
    let creator = Address::generate(&env);
    let backer = Address::generate(&env);

    token_admin.mint(&backer, &1000);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Phase 1"),
        amount: 1000,
        proof_submitted: false,
        released: false,
    });
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    // Fully fund the campaign so we can try to release
    client.contribute(&campaign_id, &backer, &1000);

    // Try to release without proof - should fail
    let result = client.try_release_milestone(&campaign_id, &1);
    assert!(result.is_err());
}

#[test]
fn test_release_milestone_succeeds_after_proof() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_client, token_admin) = setup_test(&env);
    let creator = Address::generate(&env);
    let backer = Address::generate(&env);

    token_admin.mint(&backer, &1000);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Phase 1"),
        amount: 1000,
        proof_submitted: false,
        released: false,
    });
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    client.contribute(&campaign_id, &backer, &1000);

    // Submit proof
    let proof_hash = BytesN::from_array(&env, &[7u8; 32]);
    client.submit_proof(&campaign_id, &1, &proof_hash);

    // Assert milestone status updated
    let ms_status = client.get_milestone_status(&campaign_id, &1);
    assert!(ms_status.proof_submitted);
    assert!(!ms_status.released);

    // Release milestone
    client.release_milestone(&campaign_id, &1);

    // Assert milestone released and funds transferred to creator
    let ms_status_after = client.get_milestone_status(&campaign_id, &1);
    assert!(ms_status_after.released);
    assert_eq!(token_client.balance(&creator), 1000);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_proportional_refund_math() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, token_client, token_admin) = setup_test(&env);
    let creator = Address::generate(&env);
    
    let backer_a = Address::generate(&env);
    let backer_b = Address::generate(&env);

    token_admin.mint(&backer_a, &1000);
    token_admin.mint(&backer_b, &1000);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Phase 1"),
        amount: 600,
        proof_submitted: false,
        released: false,
    });
    milestones.push_back(Milestone {
        milestone_id: 2,
        title: String::from_str(&env, "Phase 2"),
        amount: 400,
        proof_submitted: false,
        released: false,
    });

    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    // Backer A contributes 600, Backer B contributes 400 (Campaign fully funded: 1000/1000)
    client.contribute(&campaign_id, &backer_a, &600);
    client.contribute(&campaign_id, &backer_b, &400);

    // Submit proof and release Milestone 1 only
    let proof_hash = BytesN::from_array(&env, &[1u8; 32]);
    client.submit_proof(&campaign_id, &1, &proof_hash);
    client.release_milestone(&campaign_id, &1);

    // Verify creator got 600
    assert_eq!(token_client.balance(&creator), 600);
    assert_eq!(token_client.balance(&client.address), 400);

    // Advance time past deadline
    env.ledger().with_mut(|li| {
        li.timestamp = 3000;
    });

    // Finalize/Refund - Milestone 2 is unproven, so 400 should be refunded proportionally:
    // Backer A: (600 / 1000) * 400 = 240 refund
    // Backer B: (400 / 1000) * 400 = 160 refund
    let balance_a_before = token_client.balance(&backer_a); // 1000 - 600 = 400
    let balance_b_before = token_client.balance(&backer_b); // 1000 - 400 = 600

    client.finalize_or_refund(&campaign_id);

    let balance_a_after = token_client.balance(&backer_a);
    let balance_b_after = token_client.balance(&backer_b);

    assert_eq!(balance_a_after - balance_a_before, 240);
    assert_eq!(balance_b_after - balance_b_before, 160);

    // Verify contract is empty
    assert_eq!(token_client.balance(&client.address), 0);

    // Status should be Refunded
    let status = client.get_campaign_status(&campaign_id);
    assert!(matches!(status, CampaignStatus::Refunded));
}

#[test]
fn test_unauthorized_attempts() {
    let env = Env::default();
    // Do NOT call env.mock_all_auths() globally. We will trigger auth checks manually.

    let (client, _, _, _) = setup_test(&env);
    let creator = Address::generate(&env);
    let wrong_user = Address::generate(&env);

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Phase 1"),
        amount: 1000,
        proof_submitted: false,
        released: false,
    });
    
    // Creator must authorize creation
    env.mock_auths(&[
        soroban_sdk::testutils::MockAuth {
            address: &creator,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "create_campaign",
                args: (&creator, 1000_i128, 2000_u64, milestones.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }
    ]);
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    // Verify that submitting proof requires creator auth and fails if signed by wrong_user
    let proof_hash = BytesN::from_array(&env, &[5u8; 32]);

    // Mock wrong user auth
    env.mock_auths(&[
        soroban_sdk::testutils::MockAuth {
            address: &wrong_user,
            invoke: &soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "submit_proof",
                args: (campaign_id, 1_u32, &proof_hash).into_val(&env),
                sub_invokes: &[],
            },
        }
    ]);

    // This should panic or fail authorization. Since wrong_user is not creator, require_auth on creator will fail.
    let result = client.try_submit_proof(&campaign_id, &1, &proof_hash);
    assert!(result.is_err());
}

#[test]
fn test_finalize_before_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _, _) = setup_test(&env);
    let creator = Address::generate(&env);

    let mut milestones = Vec::new(&env);
    milestones.push_back(Milestone {
        milestone_id: 1,
        title: String::from_str(&env, "Phase 1"),
        amount: 1000,
        proof_submitted: false,
        released: false,
    });
    let campaign_id = client.create_campaign(&creator, &1000, &2000, &milestones);

    // Set time before deadline (1000 < 2000)
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    // Try to finalize - should fail
    let result = client.try_finalize_or_refund(&campaign_id);
    assert!(result.is_err());
}

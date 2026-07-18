#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, BytesN, Env, Symbol, Vec,
    String
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    CampaignNotFound = 1,
    MilestoneNotFound = 2,
    MilestoneProofMissing = 3,
    DeadlineNotPassed = 4,
    Unauthorized = 5,
    GoalNotMet = 6,
    CampaignEnded = 7,
    InvalidMilestones = 8,
    AlreadyRefunded = 9,
    MilestoneAlreadyReleased = 10,
    DeadlinePassed = 11,
    InvalidAmount = 12,
    NotInitialized = 13,
    AlreadyInitialized = 14,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub milestone_id: u32,
    pub title: String,
    pub amount: i128,
    pub proof_submitted: bool,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Campaign {
    pub creator: Address,
    pub goal_amount: i128,
    pub total_raised: i128,
    pub deadline: u64,
    pub milestones: Vec<Milestone>,
    pub refunded: bool,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CampaignStatus {
    Active = 0,
    PartiallyReleased = 1,
    Completed = 2,
    Refunded = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneStatus {
    pub proof_submitted: bool,
    pub released: bool,
    pub amount: i128,
}

#[contracttype]
pub enum DataKey {
    Initialized,
    Token,
    CampaignCount,
    Campaign(u64),
    BackerContribution(u64, Address),
    Backers(u64),
    ProofHash(u64, u32),
    ProofTime(u64, u32),
}

#[contract]
pub struct VeriFundContract;

// Internal helper for token address lookup
impl VeriFundContract {
    fn get_token(env: &Env) -> Address {
        match env.storage().instance().get::<_, Address>(&DataKey::Token) {
            Some(addr) => addr,
            None => env.panic_with_error(ContractError::NotInitialized),
        }
    }
}

#[contractimpl]
impl VeriFundContract {
    pub fn initialize(env: Env, token: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            env.panic_with_error(ContractError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    pub fn create_campaign(
        env: Env,
        creator: Address,
        goal_amount: i128,
        deadline: u64,
        milestones: Vec<Milestone>,
    ) -> u64 {
        creator.require_auth();

        if goal_amount <= 0 {
            env.panic_with_error(ContractError::InvalidAmount);
        }
        if deadline <= env.ledger().timestamp() {
            env.panic_with_error(ContractError::DeadlinePassed);
        }
        if milestones.is_empty() {
            env.panic_with_error(ContractError::InvalidMilestones);
        }

        // Verify milestones amount sums to goal_amount
        let mut sum: i128 = 0;
        for i in 0..milestones.len() {
            let m = milestones.get(i).unwrap();
            sum = sum.checked_add(m.amount).unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount));
        }
        if sum != goal_amount {
            env.panic_with_error(ContractError::InvalidMilestones);
        }

        // Increment campaign counter
        let mut count: u64 = env.storage().instance().get(&DataKey::CampaignCount).unwrap_or(0);
        count = count + 1;
        env.storage().instance().set(&DataKey::CampaignCount, &count);

        let campaign = Campaign {
            creator: creator.clone(),
            goal_amount,
            total_raised: 0,
            deadline,
            milestones,
            refunded: false,
        };

        env.storage().persistent().set(&DataKey::Campaign(count), &campaign);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "CampaignCreated"), count, creator),
            (goal_amount, deadline)
        );

        count
    }

    pub fn contribute(env: Env, campaign_id: u64, backer: Address, amount: i128) {
        backer.require_auth();

        if amount <= 0 {
            env.panic_with_error(ContractError::InvalidAmount);
        }

        let mut campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        if campaign.refunded {
            env.panic_with_error(ContractError::CampaignEnded);
        }

        if env.ledger().timestamp() >= campaign.deadline {
            env.panic_with_error(ContractError::CampaignEnded);
        }

        // Transfer funds from backer to contract
        let token_address = Self::get_token(&env);
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&backer, &env.current_contract_address(), &amount);

        // Update backer's contribution
        let backer_key = DataKey::BackerContribution(campaign_id, backer.clone());
        let current_contrib = env.storage().persistent().get::<_, i128>(&backer_key).unwrap_or(0);
        let new_contrib = current_contrib.checked_add(amount).unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount));
        env.storage().persistent().set(&backer_key, &new_contrib);

        // Add backer to backers list if first time
        let backers_key = DataKey::Backers(campaign_id);
        let mut backers = env.storage().persistent().get::<_, Vec<Address>>(&backers_key).unwrap_or_else(|| Vec::new(&env));
        let mut exists = false;
        for i in 0..backers.len() {
            if backers.get(i).unwrap() == backer {
                exists = true;
                break;
            }
        }
        if !exists {
            backers.push_back(backer.clone());
            env.storage().persistent().set(&backers_key, &backers);
        }

        // Update campaign total raised
        campaign.total_raised = campaign.total_raised.checked_add(amount).unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount));
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "ContributionMade"), campaign_id, backer),
            (amount, env.ledger().timestamp())
        );
    }

    pub fn submit_proof(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
        proof_hash: BytesN<32>,
    ) {
        let mut campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        campaign.creator.require_auth();

        if campaign.refunded {
            env.panic_with_error(ContractError::CampaignEnded);
        }

        // Find milestone and set proof_submitted = true
        let mut found = false;
        let mut updated_milestones = Vec::new(&env);
        for i in 0..campaign.milestones.len() {
            let mut m = campaign.milestones.get(i).unwrap();
            if m.milestone_id == milestone_id {
                m.proof_submitted = true;
                found = true;
            }
            updated_milestones.push_back(m);
        }

        if !found {
            env.panic_with_error(ContractError::MilestoneNotFound);
        }

        campaign.milestones = updated_milestones;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);

        // Save proof hash + timestamp
        let timestamp = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::ProofHash(campaign_id, milestone_id), &proof_hash);
        env.storage().persistent().set(&DataKey::ProofTime(campaign_id, milestone_id), &timestamp);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "ProofSubmitted"), campaign_id, milestone_id),
            (proof_hash, timestamp)
        );
    }

    pub fn release_milestone(env: Env, campaign_id: u64, milestone_id: u32) {
        let mut campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        if campaign.refunded {
            env.panic_with_error(ContractError::CampaignEnded);
        }

        // Check if goal was met
        if campaign.total_raised < campaign.goal_amount {
            env.panic_with_error(ContractError::GoalNotMet);
        }

        // Find milestone, check proof, check released status, update released = true
        let mut found = false;
        let mut release_amount: i128 = 0;
        let mut updated_milestones = Vec::new(&env);
        for i in 0..campaign.milestones.len() {
            let mut m = campaign.milestones.get(i).unwrap();
            if m.milestone_id == milestone_id {
                found = true;
                if !m.proof_submitted {
                    env.panic_with_error(ContractError::MilestoneProofMissing);
                }
                if m.released {
                    env.panic_with_error(ContractError::MilestoneAlreadyReleased);
                }
                m.released = true;
                release_amount = m.amount;
            }
            updated_milestones.push_back(m);
        }

        if !found {
            env.panic_with_error(ContractError::MilestoneNotFound);
        }

        campaign.milestones = updated_milestones;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);

        // Transfer milestone amount to creator
        let token_address = Self::get_token(&env);
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&env.current_contract_address(), &campaign.creator, &release_amount);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "MilestoneReleased"), campaign_id, milestone_id),
            (release_amount, env.ledger().timestamp())
        );
    }

    pub fn finalize_or_refund(env: Env, campaign_id: u64) {
        let mut campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        if campaign.refunded {
            env.panic_with_error(ContractError::AlreadyRefunded);
        }

        if env.ledger().timestamp() < campaign.deadline {
            env.panic_with_error(ContractError::DeadlineNotPassed);
        }

        let token_address = Self::get_token(&env);
        let backers_key = DataKey::Backers(campaign_id);
        let backers = env.storage().persistent().get::<_, Vec<Address>>(&backers_key).unwrap_or_else(|| Vec::new(&env));

        let total_raised = campaign.total_raised;
        let goal_amount = campaign.goal_amount;

        if total_raised < goal_amount {
            // Refund 100% of contributions
            for i in 0..backers.len() {
                let backer = backers.get(i).unwrap();
                let backer_key = DataKey::BackerContribution(campaign_id, backer.clone());
                let backer_contribution = env.storage().persistent().get::<_, i128>(&backer_key).unwrap_or(0);
                if backer_contribution > 0 {
                    let token_client = token::Client::new(&env, &token_address);
                    token_client.transfer(&env.current_contract_address(), &backer, &backer_contribution);
                    
                    // Clear contribution to prevent double refund
                    env.storage().persistent().set(&backer_key, &0_i128);

                    // Emit event
                    env.events().publish(
                        (Symbol::new(&env, "RefundIssued"), campaign_id, backer),
                        (backer_contribution, env.ledger().timestamp())
                    );
                }
            }
        } else {
            // Proportional refund for milestones where proof was NOT submitted
            let mut unproven_total: i128 = 0;
            for i in 0..campaign.milestones.len() {
                let m = campaign.milestones.get(i).unwrap();
                if !m.proof_submitted {
                    unproven_total = unproven_total.checked_add(m.amount).unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount));
                }
            }

            if unproven_total > 0 {
                for i in 0..backers.len() {
                    let backer = backers.get(i).unwrap();
                    let backer_key = DataKey::BackerContribution(campaign_id, backer.clone());
                    let backer_contribution = env.storage().persistent().get::<_, i128>(&backer_key).unwrap_or(0);
                    if backer_contribution > 0 {
                        // Math: (backer_contribution * unproven_total) / total_raised
                        let refund_amount = backer_contribution
                            .checked_mul(unproven_total)
                            .unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount))
                            .checked_div(total_raised)
                            .unwrap_or_else(|| env.panic_with_error(ContractError::InvalidAmount));

                        if refund_amount > 0 {
                            let token_client = token::Client::new(&env, &token_address);
                            token_client.transfer(&env.current_contract_address(), &backer, &refund_amount);
                            
                            // Emit event
                            env.events().publish(
                                (Symbol::new(&env, "RefundIssued"), campaign_id, backer),
                                (refund_amount, env.ledger().timestamp())
                            );
                        }
                        // Clear contribution to prevent double refund
                        env.storage().persistent().set(&backer_key, &0_i128);
                    }
                }
            }
        }

        campaign.refunded = true;
        env.storage().persistent().set(&DataKey::Campaign(campaign_id), &campaign);
    }

    pub fn get_campaign_status(env: Env, campaign_id: u64) -> CampaignStatus {
        let campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        if campaign.refunded {
            return CampaignStatus::Refunded;
        }

        let mut all_released = true;
        let mut any_released = false;
        for i in 0..campaign.milestones.len() {
            let m = campaign.milestones.get(i).unwrap();
            if m.released {
                any_released = true;
            } else {
                all_released = false;
            }
        }

        if all_released {
            CampaignStatus::Completed
        } else if any_released {
            CampaignStatus::PartiallyReleased
        } else {
            CampaignStatus::Active
        }
    }

    pub fn get_milestone_status(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> MilestoneStatus {
        let campaign = env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound));

        for i in 0..campaign.milestones.len() {
            let m = campaign.milestones.get(i).unwrap();
            if m.milestone_id == milestone_id {
                return MilestoneStatus {
                    proof_submitted: m.proof_submitted,
                    released: m.released,
                    amount: m.amount,
                };
            }
        }

        env.panic_with_error(ContractError::MilestoneNotFound)
    }

    pub fn get_backer_contribution(
        env: Env,
        campaign_id: u64,
        backer: Address,
    ) -> i128 {
        if !env.storage().persistent().has(&DataKey::Campaign(campaign_id)) {
            env.panic_with_error(ContractError::CampaignNotFound);
        }
        let backer_key = DataKey::BackerContribution(campaign_id, backer);
        env.storage().persistent().get::<_, i128>(&backer_key).unwrap_or(0)
    }

    // Dynamic helper to retrieve the proof hash and timestamp
    pub fn get_proof_record(
        env: Env,
        campaign_id: u64,
        milestone_id: u32,
    ) -> (BytesN<32>, u64) {
        let hash = env.storage().persistent().get::<_, BytesN<32>>(&DataKey::ProofHash(campaign_id, milestone_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::MilestoneProofMissing));
        let time = env.storage().persistent().get::<_, u64>(&DataKey::ProofTime(campaign_id, milestone_id))
            .unwrap_or(0);
        (hash, time)
    }

    // Helper to get total campaigns count
    pub fn get_campaign_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::CampaignCount).unwrap_or(0)
    }

    // Helper to get campaign details
    pub fn get_campaign(env: Env, campaign_id: u64) -> Campaign {
        env.storage().persistent().get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .unwrap_or_else(|| env.panic_with_error(ContractError::CampaignNotFound))
    }
}

#[cfg(test)]
mod test;

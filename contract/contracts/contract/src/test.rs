#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{Env, String};

#[test]
fn test_post_job_permissionless() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    // Anyone can post a job — no admin gate
    let job_id = client.post_job(
        &alice,
        &String::from_str(&env, "Build a landing page"),
        &String::from_str(&env, "Need a React developer"),
        &500_000_000i128, // 5 XLM in stroops
    );
    assert_eq!(job_id, 0);

    client.post_job(
        &bob,
        &String::from_str(&env, "Write technical docs"),
        &String::from_str(&env, "Write docs for my contract"),
        &100_000_000i128,
    );

    let jobs = client.get_all_jobs();
    assert_eq!(jobs.len(), 2);

    let job0 = client.get_job(&0u32);
    assert_eq!(job0.title, String::from_str(&env, "Build a landing page"));
    assert_eq!(job0.reward, 500_000_000i128);
    assert_eq!(job0.poster, alice);
    assert!(!job0.is_closed);
    assert!(!job0.has_winner);
}

#[test]
fn test_apply_with_proposal_permissionless() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env); // poster
    let bob = Address::generate(&env); // applicant
    let carol = Address::generate(&env); // applicant

    client.post_job(
        &alice,
        &String::from_str(&env, "Smart contract audit"),
        &String::from_str(&env, "Audit Soroban token contract"),
        &2_000_000_000i128,
    );

    // Anyone can apply with a proposal and price — no gate
    client.apply(
        &bob,
        &0u32,
        &String::from_str(&env, "I have 5 years auditing DeFi contracts"),
        &1_800_000_000i128,
    );
    client.apply(
        &carol,
        &0u32,
        &String::from_str(&env, "Certik-certified auditor, fast turnaround"),
        &2_100_000_000i128,
    );

    let apps = client.get_applications(&0u32);
    assert_eq!(apps.len(), 2);

    // Check proposal content is stored
    let first = apps.get(0).unwrap();
    assert_eq!(
        first.proposal,
        String::from_str(&env, "I have 5 years auditing DeFi contracts")
    );
    assert_eq!(first.proposed_price, 1_800_000_000i128);
    assert!(!first.is_withdrawn);

    // Bob can withdraw his own application
    client.withdraw_application(&bob, &0u32);
    let apps = client.get_applications(&0u32);
    let withdrawn = apps.get(0).unwrap();
    assert!(withdrawn.is_withdrawn);

    // Cannot re-apply after withdrawing
    assert!(client
        .try_apply(
            &bob,
            &0u32,
            &String::from_str(&env, "retry"),
            &1_500_000_000i128
        )
        .is_err());
}

#[test]
fn test_cannot_apply_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);

    client.post_job(
        &alice,
        &String::from_str(&env, "Write tests"),
        &String::from_str(&env, "Write unit tests"),
        &0i128,
    );

    client.apply(&alice, &0u32, &String::from_str(&env, "proposal"), &0i128);
    assert!(client
        .try_apply(&alice, &0u32, &String::from_str(&env, "again"), &0i128)
        .is_err());
}

#[test]
fn test_cannot_apply_to_closed_job() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.post_job(
        &alice,
        &String::from_str(&env, "Urgent work"),
        &String::from_str(&env, "Need it done fast"),
        &0i128,
    );

    client.apply(&bob, &0u32, &String::from_str(&env, "I can help"), &0i128);
    client.close_job(&alice, &0u32);
    // Cannot apply to a closed job
    assert!(client
        .try_apply(&bob, &0u32, &String::from_str(&env, "late"), &0i128)
        .is_err());
}

#[test]
fn test_close_job_only_poster() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.post_job(
        &alice,
        &String::from_str(&env, "Moderate job"),
        &String::from_str(&env, "Task description"),
        &0i128,
    );

    // Bob (non-poster) cannot close
    assert!(client.try_close_job(&bob, &0u32).is_err());
    // Alice (poster) can
    client.close_job(&alice, &0u32);
    assert!(client.get_job(&0u32).is_closed);
}

#[test]
fn test_set_winner_and_claim() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env); // poster
    let bob = Address::generate(&env); // applicant
    let carol = Address::generate(&env); // applicant / winner

    client.post_job(
        &alice,
        &String::from_str(&env, "Build dApp"),
        &String::from_str(&env, "Frontend + Soroban contract"),
        &1_000_000_000i128,
    );

    client.apply(
        &bob,
        &0u32,
        &String::from_str(&env, "Full-stack dev"),
        &800_000_000i128,
    );
    client.apply(
        &carol,
        &0u32,
        &String::from_str(&env, "Specialist in Soroban"),
        &950_000_000i128,
    );

    // Non-poster cannot set winner
    assert!(client.try_set_winner(&bob, &0u32, &carol).is_err());
    client.set_winner(&alice, &0u32, &carol);

    let job = client.get_job(&0u32);
    assert!(job.has_winner);
    assert!(job.winner == Some(carol.clone()));

    // Winner can claim
    assert!(client.try_claim_reward(&bob, &0u32).is_err());
    client.claim_reward(&carol, &0u32);

    let job = client.get_job(&0u32);
    assert!(job.is_closed);
}

#[test]
fn test_claim_without_winner() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.post_job(
        &alice,
        &String::from_str(&env, "Volunteer work"),
        &String::from_str(&env, "Open source"),
        &0i128,
    );

    client.apply(&bob, &0u32, &String::from_str(&env, "free rider"), &0i128);
    client.close_job(&alice, &0u32);

    // No winner set — cannot claim
    assert!(client.try_claim_reward(&bob, &0u32).is_err());
}

#[test]
fn test_get_jobs_returns_all() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let a = Address::generate(&env);
    let b = Address::generate(&env);

    client.post_job(
        &a,
        &String::from_str(&env, "Job A"),
        &String::from_str(&env, "Desc A"),
        &100i128,
    );
    client.post_job(
        &a,
        &String::from_str(&env, "Job B"),
        &String::from_str(&env, "Desc B"),
        &200i128,
    );
    client.post_job(
        &b,
        &String::from_str(&env, "Job C"),
        &String::from_str(&env, "Desc C"),
        &0i128,
    );

    let jobs = client.get_all_jobs();
    assert_eq!(jobs.len(), 3);
}

#[test]
fn test_withdraw_application() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    client.post_job(
        &alice,
        &String::from_str(&env, "Logo design"),
        &String::from_str(&env, "Need a logo"),
        &0i128,
    );

    client.apply(&bob, &0u32, &String::from_str(&env, "My proposal"), &0i128);

    // Bob can withdraw his own application
    client.withdraw_application(&bob, &0u32);
    let apps = client.get_applications(&0u32);
    assert_eq!(apps.len(), 1); // still in list, just marked withdrawn
    assert!(apps.get(0).unwrap().is_withdrawn);

    // Alice (non-applicant) cannot withdraw bob's application
    assert!(client.try_withdraw_application(&alice, &0u32).is_err());
}

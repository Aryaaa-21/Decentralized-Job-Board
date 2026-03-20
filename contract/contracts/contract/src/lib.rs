#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Vec};

#[contracttype]
#[derive(Clone)]
pub struct Job {
    pub title: String,
    pub description: String,
    pub poster: Address,
    pub reward: i128,
    pub is_closed: bool,
    pub has_winner: bool,
    pub winner: Option<Address>,
}

#[contracttype]
#[derive(Clone)]
pub struct Application {
    pub applicant: Address,
    pub proposal: String,
    pub proposed_price: i128,
    pub is_withdrawn: bool,
}

#[contracttype]
pub enum DataKey {
    Job(u32),
    Applications(u32),
    Counter,
}

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    // ═══════════════════════════════════════════════════════════
    // PERMISSIONLESS — anyone can post & apply
    // ═══════════════════════════════════════════════════════════

    /// Post a new job listing. Any funded Stellar account can post — no admin gate.
    pub fn post_job(
        env: Env,
        poster: Address,
        title: String,
        description: String,
        reward: i128,
    ) -> u32 {
        poster.require_auth();
        let counter: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let job_id = counter;
        let job = Job {
            title,
            description,
            poster,
            reward,
            is_closed: false,
            has_winner: false,
            winner: None,
        };
        env.storage().persistent().set(&DataKey::Job(job_id), &job);
        env.storage().persistent().set(
            &DataKey::Applications(job_id),
            &Vec::<Application>::new(&env),
        );
        env.storage()
            .instance()
            .set(&DataKey::Counter, &(job_id + 1));
        job_id
    }

    /// Apply to any open job with a proposal and your price.
    /// Anyone can apply to any job — no permission gate.
    pub fn apply(
        env: Env,
        applicant: Address,
        job_id: u32,
        proposal: String,
        proposed_price: i128,
    ) {
        applicant.require_auth();
        let job: Job = env
            .storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found");
        assert!(!job.is_closed, "job is closed");
        let mut apps: Vec<Application> = env
            .storage()
            .persistent()
            .get(&DataKey::Applications(job_id))
            .unwrap_or_else(|| Vec::new(&env));
        // Prevent double-application (withdrawn apps still count as applied)
        for i in 0..apps.len() {
            let a = apps.get(i).unwrap();
            if a.applicant == applicant {
                panic!("already applied");
            }
        }
        apps.push_back(Application {
            applicant,
            proposal,
            proposed_price,
            is_withdrawn: false,
        });
        env.storage()
            .persistent()
            .set(&DataKey::Applications(job_id), &apps);
    }

    /// Withdraw your own application before job is closed.
    /// Only the applicant can withdraw their own application.
    pub fn withdraw_application(env: Env, applicant: Address, job_id: u32) {
        applicant.require_auth();
        let job: Job = env
            .storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found");
        assert!(!job.is_closed, "job is closed");
        let mut apps: Vec<Application> = env
            .storage()
            .persistent()
            .get(&DataKey::Applications(job_id))
            .unwrap_or_else(|| Vec::new(&env));
        for i in 0..apps.len() {
            let mut a = apps.get(i).unwrap();
            if a.applicant == applicant {
                assert!(!a.is_withdrawn, "already withdrawn");
                a.is_withdrawn = true;
                apps.set(i, a);
                env.storage()
                    .persistent()
                    .set(&DataKey::Applications(job_id), &apps);
                return;
            }
        }
        panic!("no application found");
    }

    // ═══════════════════════════════════════════════════════════
    // READ-ONLY — fully permissionless
    // ═══════════════════════════════════════════════════════════

    /// Get a single job by ID.
    pub fn get_job(env: Env, job_id: u32) -> Job {
        env.storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found")
    }

    /// Get all jobs posted to the board.
    pub fn get_all_jobs(env: Env) -> Vec<Job> {
        let counter: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        let mut jobs = Vec::new(&env);
        let mut i = 0u32;
        loop {
            if i >= counter {
                break;
            }
            if let Some(job) = env.storage().persistent().get::<_, Job>(&DataKey::Job(i)) {
                jobs.push_back(job);
            }
            i += 1;
        }
        jobs
    }

    /// Get applications for a job (includes withdrawn ones).
    pub fn get_applications(env: Env, job_id: u32) -> Vec<Application> {
        env.storage()
            .persistent()
            .get(&DataKey::Applications(job_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ═══════════════════════════════════════════════════════════
    // POSTER-ONLY — job owner, not admin (by design)
    // ═══════════════════════════════════════════════════════════

    /// Close a job listing. Only the poster can close.
    pub fn close_job(env: Env, poster: Address, job_id: u32) {
        poster.require_auth();
        let mut job: Job = env
            .storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found");
        assert_eq!(job.poster, poster, "not the poster");
        assert!(!job.is_closed, "already closed");
        job.is_closed = true;
        env.storage().persistent().set(&DataKey::Job(job_id), &job);
    }

    /// Select the winning applicant. Only the poster can set a winner.
    pub fn set_winner(env: Env, poster: Address, job_id: u32, winner: Address) {
        poster.require_auth();
        let mut job: Job = env
            .storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found");
        assert_eq!(job.poster, poster, "not the poster");
        assert!(!job.has_winner, "winner already set");
        job.has_winner = true;
        job.winner = Some(winner);
        env.storage().persistent().set(&DataKey::Job(job_id), &job);
    }

    /// Claim reward. Only the selected winner can claim.
    /// Marks the job as completed. Actual payment handled off-chain.
    pub fn claim_reward(env: Env, winner: Address, job_id: u32) {
        winner.require_auth();
        let mut job: Job = env
            .storage()
            .persistent()
            .get(&DataKey::Job(job_id))
            .expect("job not found");
        assert!(job.has_winner, "no winner set");
        assert_eq!(job.winner, Some(winner), "not the winner");
        assert!(!job.is_closed, "already closed");
        job.is_closed = true;
        env.storage().persistent().set(&DataKey::Job(job_id), &job);
    }
}

mod test;

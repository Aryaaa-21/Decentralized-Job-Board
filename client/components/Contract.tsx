"use client";

import { useState, useCallback } from "react";
import {
  postJob,
  applyToJob,
  getAllJobs,
  getApplications,
  closeJob,
  setWinner,
  claimReward,
  withdrawApplication,
  CONTRACT_ADDRESS,
} from "@/hooks/contract";
import { AnimatedCard } from "@/components/ui/animated-card";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Job {
  title: string;
  description: string;
  poster: string;
  reward: string;
  is_closed: boolean;
  has_winner: boolean;
  winner: string | null;
}

interface Application {
  applicant: string;
  proposal: string;
  proposed_price: string;
  is_withdrawn: boolean;
}

type Tab = "browse" | "post" | "manage";

// ── Icons ────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

// ── Styled Input ─────────────────────────────────────────────

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#7c6cf0]/30 focus-within:shadow-[0_0_20px_rgba(124,108,240,0.08)]">
        <input
          {...props}
          className="w-full rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none"
        />
      </div>
    </div>
  );
}

function Textarea({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#7c6cf0]/30 focus-within:shadow-[0_0_20px_rgba(124,108,240,0.08)]">
        <textarea
          {...props}
          rows={3}
          className="w-full rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none resize-none"
        />
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

const truncate = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

const formatReward = (raw: string | number) => {
  const n = typeof raw === "string" ? parseFloat(raw) : raw;
  if (isNaN(n)) return "0 XLM";
  return `${(n / 1e7).toFixed(2)} XLM`;
};

// ── Job Card ─────────────────────────────────────────────────

function JobCard({
  job,
  jobId,
  walletAddress,
  onApply,
  onClose,
  onSetWinner,
  onClaim,
  isLoading,
}: {
  job: Job;
  jobId: number;
  walletAddress: string | null;
  onApply: (id: number) => void;
  onClose: (id: number) => void;
  onSetWinner: (id: number, applicant: string) => void;
  onClaim: (id: number) => void;
  isLoading: boolean;
}) {
  const [showApplicants, setShowApplicants] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState("");
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [showWinnerForm, setShowWinnerForm] = useState(false);

  const isPoster = walletAddress === job.poster;
  const isWinner = job.winner === walletAddress;
  const canApply = !job.is_closed && walletAddress && walletAddress !== job.poster;

  const handleViewApplicants = useCallback(async () => {
    setShowApplicants(!showApplicants);
    if (!showApplicants && applicants.length === 0) {
      setLoadingApplicants(true);
      try {
        const res = await getApplications(jobId, walletAddress || undefined);
        const apps = Array.isArray(res) ? res : [];
        setApplicants(apps.map((a: Record<string, unknown>) => ({
          applicant: String(a.applicant ?? ""),
          proposal: String(a.proposal ?? ""),
          proposed_price: String(a.proposed_price ?? "0"),
          is_withdrawn: Boolean(a.is_withdrawn ?? false),
        })));
      } catch {
        setApplicants([]);
      } finally {
        setLoadingApplicants(false);
      }
    }
  }, [jobId, showApplicants, applicants.length, walletAddress]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-fade-in-up">
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white/90 text-sm truncate">{String(job.title)}</h4>
            <p className="text-xs text-white/40 mt-1 line-clamp-2">{String(job.description)}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {Number(job.reward) > 0 ? (
              <span className="text-xs font-mono font-semibold text-[#fbbf24]">
                {formatReward(job.reward)}
              </span>
            ) : (
              <Badge variant="info" className="text-[9px]">Volunteer</Badge>
            )}
            {job.is_closed ? (
              <Badge variant="success" className="text-[9px]">Closed</Badge>
            ) : (
              <Badge variant="info" className="text-[9px]">Open</Badge>
            )}
          </div>
        </div>

        {/* Poster */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-white/25">
            <GlobeIcon />
            <span>Posted by</span>
            <span className="font-mono text-white/40">{truncate(job.poster)}</span>
            {isPoster && <Badge variant="warning" className="text-[9px] ml-1">You</Badge>}
          </div>
          {job.has_winner && (
            <div className="flex items-center gap-1 text-[10px] text-[#fbbf24]/70">
              <StarIcon />
              <span>{truncate(job.winner!)}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {canApply && (
            <ShimmerButton
              onClick={() => onApply(jobId)}
              disabled={isLoading}
              shimmerColor="#34d399"
              className="flex-1 text-xs py-2"
            >
              {isLoading ? <><SpinnerIcon /> Applying...</> : <><PlusIcon /> Apply</>}
            </ShimmerButton>
          )}

          {isPoster && !job.is_closed && !job.has_winner && (
            <ShimmerButton
              onClick={() => onClose(jobId)}
              disabled={isLoading}
              shimmerColor="#f87171"
              className="flex-1 text-xs py-2"
            >
              {isLoading ? <><SpinnerIcon /> Closing...</> : <><XIcon /> Close Job</>}
            </ShimmerButton>
          )}

          {isWinner && !job.is_closed && (
            <ShimmerButton
              onClick={() => onClaim(jobId)}
              disabled={isLoading}
              shimmerColor="#fbbf24"
              className="flex-1 text-xs py-2"
            >
              {isLoading ? <><SpinnerIcon /> Claiming...</> : <><StarIcon /> Claim Reward</>}
            </ShimmerButton>
          )}

          {!job.is_closed && applicants.length > 0 && (
            <button
              onClick={handleViewApplicants}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-white/40 hover:text-white/70 hover:border-white/[0.1] transition-all active:scale-95"
            >
              {loadingApplicants ? <SpinnerIcon /> : <UserIcon />}
              {applicants.length} applicant{applicants.length !== 1 ? "s" : ""}
            </button>
          )}

          {job.has_winner && !job.is_closed && isPoster && !showWinnerForm && (
            <button
              onClick={() => setShowWinnerForm(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[#fbbf24]/20 bg-[#fbbf24]/[0.05] px-3 py-2 text-xs text-[#fbbf24]/70 hover:text-[#fbbf24] hover:border-[#fbbf24]/30 transition-all active:scale-95"
            >
              <StarIcon /> Select Winner
            </button>
          )}
        </div>

        {/* Winner selection form */}
        {showWinnerForm && (
          <div className="flex gap-2 animate-fade-in-up">
            <select
              className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-xs font-mono text-white/70 outline-none"
              value={selectedWinner}
              onChange={(e) => setSelectedWinner(e.target.value)}
            >
              <option value="">Select winner...</option>
              {applicants.filter(a => !a.is_withdrawn).map((app) => (
                <option key={app.applicant} value={app.applicant}>{truncate(app.applicant)}</option>
              ))}
            </select>
            <ShimmerButton
              onClick={() => {
                if (selectedWinner) {
                  onSetWinner(jobId, selectedWinner);
                  setShowWinnerForm(false);
                }
              }}
              disabled={!selectedWinner || isLoading}
              shimmerColor="#fbbf24"
              className="text-xs px-3"
            >
              Confirm
            </ShimmerButton>
            <button
              onClick={() => setShowWinnerForm(false)}
              className="px-3 py-2 text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Applicants list */}
        {showApplicants && (
          <div className="space-y-1.5 pt-2 border-t border-white/[0.04] animate-fade-in-up">
            <p className="text-[10px] font-medium uppercase tracking-wider text-white/25 mb-2">
              Applicants
            </p>
            {loadingApplicants ? (
              <p className="text-xs text-white/30">Loading...</p>
            ) : applicants.length === 0 ? (
              <p className="text-xs text-white/30">No applicants yet.</p>
            ) : (
            applicants.filter(a => !a.is_withdrawn).map((app) => (
                <div key={app.applicant} className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                  <span className="font-mono text-xs text-white/60">{truncate(app.applicant)}</span>
                  {job.winner === app.applicant && (
                    <Badge variant="warning" className="text-[9px]">
                      <StarIcon /> Winner
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function ContractUI({ walletAddress, onConnect, isConnecting }: {
  walletAddress: string | null;
  onConnect: () => void;
  isConnecting: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Browse state
  const [jobs, setJobs] = useState<{ job: Job; id: number }[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [loadingJobId, setLoadingJobId] = useState<number | null>(null);

  // Post state
  const [postTitle, setPostTitle] = useState("");
  const [postDesc, setPostDesc] = useState("");
  const [postReward, setPostReward] = useState("");
  const [isPosting, setIsPosting] = useState(false);

  // ── Handlers ──────────────────────────────────────────────

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try {
      const result = await getAllJobs(walletAddress || undefined);
      const jobsList: { job: Job; id: number }[] = [];
      if (Array.isArray(result)) {
        for (let i = 0; i < result.length; i++) {
          const item = result[i] as Record<string, unknown>;
          jobsList.push({
            id: i,
            job: {
              title: String(item.title ?? ""),
              description: String(item.description ?? ""),
              poster: String(item.poster ?? ""),
              reward: String(item.reward ?? "0"),
              is_closed: Boolean(item.is_closed ?? false),
              has_winner: Boolean(item.has_winner ?? false),
              winner: item.winner ? String(item.winner) : null,
            },
          });
        }
      }
      setJobs(jobsList);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setIsLoadingJobs(false);
    }
  }, [walletAddress]);

  const handleApply = useCallback(async (jobId: number) => {
    if (!walletAddress) return setError("Connect wallet first");
    setLoadingJobId(jobId);
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await applyToJob(walletAddress, jobId, "", BigInt(0));
      setTxStatus("Application submitted!");
      await loadJobs();
      setTimeout(() => setTxStatus(null), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Application failed");
      setTxStatus(null);
    } finally {
      setLoadingJobId(null);
    }
  }, [walletAddress, loadJobs]);

  const handleClose = useCallback(async (jobId: number) => {
    if (!walletAddress) return setError("Connect wallet first");
    setLoadingJobId(jobId);
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await closeJob(walletAddress, jobId);
      setTxStatus("Job closed!");
      await loadJobs();
      setTimeout(() => setTxStatus(null), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Close failed");
      setTxStatus(null);
    } finally {
      setLoadingJobId(null);
    }
  }, [walletAddress, loadJobs]);

  const handleSetWinner = useCallback(async (jobId: number, winner: string) => {
    if (!walletAddress) return setError("Connect wallet first");
    setLoadingJobId(jobId);
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await setWinner(walletAddress, jobId, winner);
      setTxStatus("Winner selected! They can now claim the reward.");
      await loadJobs();
      setTimeout(() => setTxStatus(null), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Set winner failed");
      setTxStatus(null);
    } finally {
      setLoadingJobId(null);
    }
  }, [walletAddress, loadJobs]);

  const handleClaim = useCallback(async (jobId: number) => {
    if (!walletAddress) return setError("Connect wallet first");
    setLoadingJobId(jobId);
    setError(null);
    setTxStatus("Awaiting signature...");
    try {
      await claimReward(walletAddress, jobId);
      setTxStatus("Reward claimed! Job marked complete.");
      await loadJobs();
      setTimeout(() => setTxStatus(null), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Claim failed");
      setTxStatus(null);
    } finally {
      setLoadingJobId(null);
    }
  }, [walletAddress, loadJobs]);

  const handlePostJob = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    if (!postTitle.trim() || !postDesc.trim()) return setError("Fill in title and description");
    const rewardNum = parseFloat(postReward) || 0;
    const rewardStroops = BigInt(Math.round(rewardNum * 1e7));
    setError(null);
    setIsPosting(true);
    setTxStatus("Awaiting signature...");
    try {
      await postJob(walletAddress, postTitle.trim(), postDesc.trim(), rewardStroops);
      setTxStatus("Job posted on-chain!");
      setPostTitle("");
      setPostDesc("");
      setPostReward("");
      await loadJobs();
      setActiveTab("browse");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Post failed");
      setTxStatus(null);
    } finally {
      setIsPosting(false);
    }
  }, [walletAddress, postTitle, postDesc, postReward, loadJobs]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "browse", label: "Browse", icon: <GlobeIcon />, color: "#4fc3f7" },
    { key: "post", label: "Post Job", icon: <BriefcaseIcon />, color: "#7c6cf0" },
    { key: "manage", label: "Manage", icon: <UserIcon />, color: "#fbbf24" },
  ];

  return (
    <div className="w-full max-w-2xl animate-fade-in-up-up-delayed">
      {/* Toasts */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#f87171]/15 bg-[#f87171]/[0.05] px-4 py-3 backdrop-blur-sm animate-slide-down">
          <span className="mt-0.5 text-[#f87171]"><AlertIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#f87171]/90">Error</p>
            <p className="text-xs text-[#f87171]/50 mt-0.5 break-all">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="shrink-0 text-[#f87171]/30 hover:text-[#f87171]/70 text-lg leading-none">&times;</button>
        </div>
      )}

      {txStatus && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#34d399]/15 bg-[#34d399]/[0.05] px-4 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(52,211,153,0.05)] animate-slide-down">
          <span className="text-[#34d399]">
            {txStatus.includes("on-chain") || txStatus.includes("submitted") || txStatus.includes("claimed") || txStatus.includes("posted") ? <CheckIcon /> : <SpinnerIcon />}
          </span>
          <span className="text-sm text-[#34d399]/90">{txStatus}</span>
        </div>
      )}

      {/* Main Card */}
      <Spotlight className="rounded-2xl">
        <AnimatedCard className="p-0" containerClassName="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c6cf0]/20 to-[#4fc3f7]/20 border border-white/[0.06]">
                <BriefcaseIcon />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">Stellar Jobs</h3>
                <p className="text-[10px] text-white/25 font-mono mt-0.5">{truncate(CONTRACT_ADDRESS)}</p>
              </div>
            </div>
            <Badge variant="info" className="text-[10px]">Soroban</Badge>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setActiveTab(t.key);
                  setError(null);
                  if (t.key === "browse" || t.key === "manage") loadJobs();
                }}
                className={cn(
                  "relative flex items-center gap-2 px-5 py-3.5 text-sm font-medium transition-all",
                  activeTab === t.key ? "text-white/90" : "text-white/35 hover:text-white/55"
                )}
              >
                <span style={activeTab === t.key ? { color: t.color } : undefined}>{t.icon}</span>
                {t.label}
                {activeTab === t.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                    style={{ background: `linear-gradient(to right, ${t.color}, ${t.color}66)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6 space-y-5">
            {/* Browse */}
            {activeTab === "browse" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-white/25 font-mono">
                    {jobs.length} job{jobs.length !== 1 ? "s" : ""} found
                  </p>
                  <ShimmerButton
                    onClick={loadJobs}
                    disabled={isLoadingJobs}
                    shimmerColor="#4fc3f7"
                    className="text-xs px-3 py-1.5"
                  >
                    {isLoadingJobs ? <><SpinnerIcon /> Loading...</> : "Refresh"}
                  </ShimmerButton>
                </div>

                {isLoadingJobs && jobs.length === 0 ? (
                  <div className="text-center py-8 text-white/25 text-sm">Loading jobs...</div>
                ) : jobs.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-white/40 text-sm">No jobs yet. Be the first to post!</p>
                    <button onClick={() => setActiveTab("post")}
                      className="text-xs text-[#7c6cf0]/60 hover:text-[#7c6cf0] transition-colors underline">
                      Post a job
                    </button>
                  </div>
                ) : (
                  jobs.map(({ job, id }) => (
                    <JobCard
                      key={id}
                      job={job}
                      jobId={id}
                      walletAddress={walletAddress}
                      onApply={handleApply}
                      onClose={handleClose}
                      onSetWinner={handleSetWinner}
                      onClaim={handleClaim}
                      isLoading={loadingJobId === id}
                    />
                  ))
                )}
              </div>
            )}

            {/* Post Job */}
            {activeTab === "post" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <p className="text-xs text-white/25 font-mono">
                    Permissionless — any wallet can post a job
                  </p>
                </div>

                <Input
                  label="Job Title"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="e.g. Build a Soroban smart contract"
                  maxLength={100}
                />
                <Textarea
                  label="Description"
                  value={postDesc}
                  onChange={(e) => setPostDesc(e.target.value)}
                  placeholder="Describe the work, requirements, and timeline..."
                  maxLength={500}
                />
                <Input
                  label="Reward (XLM, optional)"
                  value={postReward}
                  onChange={(e) => setPostReward(e.target.value)}
                  placeholder="0 = volunteer / unpaid"
                  type="number"
                  min="0"
                  step="0.01"
                />

                {walletAddress ? (
                  <ShimmerButton
                    onClick={handlePostJob}
                    disabled={isPosting}
                    shimmerColor="#7c6cf0"
                    className="w-full"
                  >
                    {isPosting ? <><SpinnerIcon /> Posting...</> : <><BriefcaseIcon /> Post Job</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#7c6cf0]/20 bg-[#7c6cf0]/[0.03] py-4 text-sm text-[#7c6cf0]/60 hover:border-[#7c6cf0]/30 hover:text-[#7c6cf0]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to post a job
                  </button>
                )}
              </div>
            )}

            {/* Manage */}
            {activeTab === "manage" && (
              <div className="space-y-4">
                <p className="text-xs text-white/25 font-mono">
                  Jobs you posted — only visible to you
                </p>
                {isLoadingJobs ? (
                  <div className="text-center py-8 text-white/25 text-sm">Loading...</div>
                ) : (
                  jobs
                    .filter(({ job }) => walletAddress && job.poster === walletAddress)
                    .map(({ job, id }) => (
                      <JobCard
                        key={id}
                        job={job}
                        jobId={id}
                        walletAddress={walletAddress}
                        onApply={handleApply}
                        onClose={handleClose}
                        onSetWinner={handleSetWinner}
                        onClaim={handleClaim}
                        isLoading={loadingJobId === id}
                      />
                    ))
                )}
                {walletAddress && jobs.filter(({ job }) => job.poster === walletAddress).length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-white/40 text-sm">You haven&apos;t posted any jobs yet.</p>
                    <button onClick={() => setActiveTab("post")}
                      className="text-xs text-[#fbbf24]/60 hover:text-[#fbbf24] transition-colors underline">
                      Post your first job
                    </button>
                  </div>
                )}
                {!walletAddress && (
                  <button onClick={onConnect} disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] py-4 text-sm text-[#fbbf24]/60 hover:border-[#fbbf24]/30 hover:text-[#fbbf24]/80 active:scale-[0.99] transition-all disabled:opacity-50">
                    Connect wallet to manage your jobs
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.04] px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-white/15">Stellar Jobs &middot; Soroban &middot; Permissionless</p>
            <div className="flex items-center gap-2">
              {["Open", "Closed"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-1 w-1 rounded-full", i === 0 ? "bg-[#34d399]" : "bg-white/20")} />
                  <span className="font-mono text-[9px] text-white/15">{s}</span>
                  {i < 1 && <span className="text-white/10 text-[8px]">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </Spotlight>
    </div>
  );
}

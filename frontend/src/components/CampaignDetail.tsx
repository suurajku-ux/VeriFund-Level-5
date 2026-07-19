import React, { useEffect, useState } from 'react';
import { Campaign, StellarService, Milestone, getUseSimulation } from '../stellar';
import { ArrowLeft, Clock, ShieldCheck, FileCheck, Award, Upload, CheckCircle, HelpCircle, Loader2, AlertCircle } from 'lucide-react';

interface CampaignDetailProps {
  campaignId: number;
  address: string;
  onBack: () => void;
  onRefresh: () => void;
}

export const CampaignDetail: React.FC<CampaignDetailProps> = ({ campaignId, address, onBack, onRefresh }) => {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contribAmount, setContribAmount] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [uploadingMilestoneId, setUploadingMilestoneId] = useState<number | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState('');
  const [trustScore, setTrustScore] = useState<number | null>(null);

  const fetchCampaign = async () => {
    try {
      const list = await StellarService.getCampaigns();
      const item = list.find(c => c.id === campaignId);
      if (item) setCampaign(item);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCampaign();
  }, [campaignId]);

  useEffect(() => {
    if (campaign) {
      StellarService.getCreatorTrustScore(campaign.creator)
        .then(setTrustScore)
        .catch(() => setTrustScore(100));
    }
  }, [campaignId, campaign?.creator]);

  if (!campaign) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const isCreator = address.toLowerCase() === campaign.creator.toLowerCase();
  const hasEnded = (Date.now() / 1000) >= campaign.deadline;

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError('');
    setActionSuccess('');

    if (!address) {
      setActionError('Please connect your wallet first.');
      return;
    }

    if (contribAmount <= 0) {
      setActionError('Contribution amount must be positive.');
      return;
    }

    // Check balance
    let balance = 0;
    const useSim = getUseSimulation();
    if (useSim) {
      const savedBal = localStorage.getItem(`verifund_balance_${address}`);
      balance = savedBal ? Number(savedBal) : 1000;
    } else {
      try {
        const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
        if (res.ok) {
          const data = await res.json();
          const nativeBal = data.balances.find((b: any) => b.asset_type === 'native');
          if (nativeBal) {
            balance = Number(nativeBal.balance);
          }
        } else if (res.status === 404) {
          setActionError('Your account is not funded on Stellar Testnet yet. Please fund it first.');
          return;
        } else {
          // Horizon error: bypass client-side balance check and let contract simulation handle it
          balance = Infinity;
        }
      } catch (e) {
        // Network/Horizon error: bypass client-side balance check and let contract simulation handle it
        balance = Infinity;
      }
    }

    if (balance < contribAmount) {
      setActionError(`Insufficient balance in your wallet. You have ${balance === Infinity ? 'unknown' : balance.toLocaleString()} XLM but tried to contribute ${contribAmount} XLM.`);
      return;
    }

    setLoading(true);

    try {
      await StellarService.contribute(campaign.id, contribAmount);
      
      // Deduct simulated balance
      if (useSim) {
        localStorage.setItem(`verifund_balance_${address}`, String(balance - contribAmount));
      }

      setActionSuccess(`Successfully contributed ${contribAmount} XLM to the campaign escrow!`);
      setContribAmount(50);
      fetchCampaign();
      onRefresh();
    } catch (e: any) {
      setActionError(e.message || 'Contribution failed.');
    } finally {
      setLoading(false);
    }
  };

  // Client-side file hashing (SHA-256)
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setActionError('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setFileHash(hashHex);
    } catch (err) {
      setActionError('Failed to hash file. Try another file.');
    }
  };

  const handleSubmitProof = async (milestoneId: number) => {
    setActionError('');
    setActionSuccess('');

    if (!fileHash) {
      setActionError('Please select a file to hash before submitting.');
      return;
    }

    setLoading(true);

    try {
      await StellarService.submitProof(campaign.id, milestoneId, fileHash);
      setActionSuccess(`Milestone proof-hash submitted on-chain!`);
      setSelectedFile(null);
      setFileHash('');
      setUploadingMilestoneId(null);
      fetchCampaign();
      onRefresh();
    } catch (e: any) {
      setActionError(e.message || 'Proof submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async (milestoneId: number) => {
    setActionError('');
    setActionSuccess('');
    setLoading(true);

    try {
      await StellarService.releaseMilestone(campaign.id, milestoneId);
      setActionSuccess(`Funds for milestone released and sent to campaign creator!`);
      fetchCampaign();
      onRefresh();
    } catch (e: any) {
      setActionError(e.message || 'Failed to release milestone.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setActionError('');
    setActionSuccess('');
    setLoading(true);

    try {
      await StellarService.finalizeOrRefund(campaign.id);
      setActionSuccess(`Campaign finalized! Unproven milestone funds have been proportionally refunded to backers.`);
      fetchCampaign();
      onRefresh();
    } catch (e: any) {
      setActionError(e.message || 'Finalization failed.');
    } finally {
      setLoading(false);
    }
  };

  const progress = Math.min(100, Math.round((campaign.total_raised / campaign.goal_amount) * 100));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-all font-semibold"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Feed
      </button>

      {/* Main Campaign info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2/3 Content */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 border border-white/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-[4px] h-full bg-gradient-to-b from-blue-500 to-teal-400"></div>
            
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-wide">{campaign.category}</span>
                {campaign.verified_ngo && (
                  <span className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-teal-500/15 text-teal-400 border border-teal-500/30 text-[10px] font-bold tracking-wider uppercase">
                    <ShieldCheck className="h-3 w-3" /> NGO Verified
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {hasEnded ? 'Ended' : `Ends: ${new Date(campaign.deadline * 1000).toLocaleDateString()}`}
              </span>
            </div>

            <h1 className="text-3xl font-extrabold font-outfit text-white mb-4 leading-tight">
              {campaign.title}
            </h1>

            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap mb-6">
              {campaign.description}
            </p>

            <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-xs space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 truncate"><span className="font-semibold text-gray-300">Creator Escrow:</span> {campaign.creator}</p>
                {trustScore !== null && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border uppercase tracking-wider ${
                    trustScore >= 80 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : trustScore >= 50 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    Creator Trust Score: {trustScore}%
                  </span>
                )}
              </div>
              <p className="text-gray-400"><span className="font-semibold text-gray-300">VeriFund Contract:</span> Deployed on Stellar Testnet</p>
            </div>
          </div>

          {/* Milestones Escrow Tracker */}
          <div className="glass-card p-6 border border-white/10">
            <h2 className="text-xl font-bold font-outfit text-white mb-5 flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-400" />
              Milestone Escrow Release Progress
            </h2>

            {/* Interactive Timeline Bar */}
            <div className="mb-6 p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Milestone Timeline</h3>
              <div className="flex items-center justify-between relative mt-2 px-4">
                {/* Connecting line */}
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/10 -translate-y-1/2 z-0"></div>
                {campaign.milestones.map((m, index) => {
                  const isCompleted = m.released;
                  const isProven = m.proof_submitted;
                  return (
                    <div key={m.milestone_id} className="flex flex-col items-center z-10 relative">
                      <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center font-bold text-xs ${
                        isCompleted 
                          ? 'bg-teal-500 border-teal-400 text-black shadow-lg shadow-teal-500/20' 
                          : isProven 
                            ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                            : 'bg-slate-800 border-slate-700 text-gray-400'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="text-[9px] text-gray-400 mt-1 font-semibold truncate max-w-[80px]">
                        {m.released ? 'Released' : m.proof_submitted ? 'Proven' : 'Pending'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cryptographic explanation info box */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs rounded-lg flex items-start gap-2 mb-4">
              <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>What is a Cryptographic Proof Hash?</strong>
                <p className="text-gray-300 mt-0.5 leading-relaxed">
                  A proof hash is a unique 32-byte fingerprint (SHA-256) of your medical document generated directly on your browser. 
                  Only this fingerprint is recorded on the Stellar ledger. This guarantees absolute verification that the receipt exists, 
                  while protecting the patient's private medical data from being publicly readable on-chain.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {campaign.milestones.map((m, index) => {
                const isUploading = uploadingMilestoneId === m.milestone_id;
                
                return (
                  <div key={m.milestone_id} className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2 py-0.5 bg-white/10 rounded text-gray-300">Milestone #{index + 1}</span>
                          <span className="text-xs font-bold text-teal-400">{m.amount} XLM</span>
                        </div>
                        <h3 className="font-semibold text-white mt-1 text-sm">{m.title}</h3>
                      </div>

                      {/* Milestone Status Indicators */}
                      <div className="flex items-center gap-2">
                        {m.released ? (
                          <span className="px-2 py-1 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-semibold flex items-center gap-1">
                            <CheckCircle className="h-3.5 w-3.5" /> Released
                          </span>
                        ) : m.proof_submitted ? (
                          <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center gap-1">
                            <FileCheck className="h-3.5 w-3.5" /> Proof Submitted
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center gap-1">
                            <HelpCircle className="h-3.5 w-3.5" /> Unproven
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Proof detail */}
                    {m.proof_submitted && m.proof_hash && (
                      <div className="p-2.5 bg-black/40 rounded-lg text-xs font-mono space-y-1 text-gray-400 border border-white/5">
                        <p className="truncate"><span className="font-semibold text-gray-300">Proof Hash:</span> {m.proof_hash}</p>
                        <p><span className="font-semibold text-gray-300">Submitted:</span> {new Date(m.proof_timestamp! * 1000).toLocaleString()}</p>
                      </div>
                    )}

                    {/* Creator Actions */}
                    {isCreator && !campaign.refunded && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {!m.proof_submitted && !isUploading && (
                          <button
                            onClick={() => setUploadingMilestoneId(m.milestone_id)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/35 text-blue-400 border border-blue-500/35 rounded-lg font-semibold transition-all"
                          >
                            <Upload className="h-3.5 w-3.5" /> Submit Receipt Proof
                          </button>
                        )}

                        {m.proof_submitted && !m.released && campaign.total_raised >= campaign.goal_amount && (
                          <button
                            onClick={() => handleRelease(m.milestone_id)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 bg-teal-600/20 hover:bg-teal-600/35 text-teal-400 border border-teal-500/35 rounded-lg font-semibold transition-all"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" /> Release Milestone Funds
                          </button>
                        )}

                        {m.proof_submitted && !m.released && campaign.total_raised < campaign.goal_amount && (
                          <p className="text-xs text-amber-400/80 flex items-center gap-1 bg-amber-500/5 px-2.5 py-1.5 rounded-lg border border-amber-500/10">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Funds release is locked until total goal is fully funded.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Receipt Hashing Dropdown Form */}
                    {isUploading && (
                      <div className="p-3 bg-slate-900/60 border border-white/5 rounded-lg space-y-3">
                        <div className="text-xs">
                          <p className="font-semibold text-gray-300">Upload Receipt / Medical Bill Document</p>
                          <p className="text-gray-400 mt-0.5">The document is hashed locally on your computer. We NEVER upload the file to any server.</p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="file"
                            className="flex-1 text-xs text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600/20 file:text-blue-400 hover:file:bg-blue-600/30"
                            onChange={handleFileChange}
                          />
                        </div>

                        {fileHash && (
                          <div className="space-y-2">
                            <div className="p-2 bg-black/50 rounded text-[10px] font-mono text-teal-400 truncate">
                              SHA-256 Hash: {fileHash}
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setUploadingMilestoneId(null);
                                  setSelectedFile(null);
                                  setFileHash('');
                                }}
                                className="text-xs px-2.5 py-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded font-semibold"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSubmitProof(m.milestone_id)}
                                className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold"
                              >
                                Submit Hash On-chain
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right 1/3 Sidepanel - Escrow Contribution Info */}
        <div className="space-y-6">
          <div className="glass-card p-6 border border-white/10 space-y-5">
            <h2 className="text-lg font-bold font-outfit text-white">Campaign Escrow</h2>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Raised / Goal</span>
                <span className="font-semibold text-white">{campaign.total_raised} / {campaign.goal_amount} XLM</span>
              </div>
              <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <p className="text-center text-xs font-bold text-blue-400 mt-1">{progress}% Funded</p>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            {actionSuccess && (
              <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs rounded-lg flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {/* Contribute Form */}
            {!campaign.refunded && !hasEnded && (
              <form onSubmit={handleContribute} className="space-y-3">
                <label className="block text-xs font-bold text-gray-300 uppercase">Back this campaign</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    className="flex-1 px-3 py-2 rounded-lg glass-input text-sm font-bold text-right"
                    value={contribAmount}
                    onChange={(e) => setContribAmount(Number(e.target.value))}
                    required
                  />
                  <span className="flex items-center text-sm font-semibold text-gray-400 bg-white/5 px-3 rounded-lg border border-white/5">XLM</span>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-500/15 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Contribute to Escrow'}
                </button>
              </form>
            )}

            {/* Finalization Section */}
            {hasEnded && !campaign.refunded && (
              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-3">
                <p className="text-xs text-amber-300 leading-relaxed">
                  <strong>Campaign Deadline Reached!</strong>
                  <br />
                  If the creator failed to submit receipt proofs for any milestone, backers are entitled to a proportional refund of the unproven amount.
                </p>
                <button
                  onClick={handleFinalize}
                  disabled={loading}
                  className="w-full py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Trigger Proportional Refund'}
                </button>
              </div>
            )}

            {campaign.refunded && (
              <div className="p-4 bg-teal-500/5 border border-teal-500/10 rounded-xl text-center">
                <p className="text-xs font-bold text-teal-400">Finalized & Refunded</p>
                <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                  This campaign is archived. Any unproven milestone funds have been sent back to backers.
                </p>
              </div>
            )}
          </div>

          {/* Social Sharing Card */}
          <div className="glass-card p-6 border border-white/10 space-y-4">
            <h2 className="text-lg font-bold font-outfit text-white">Share Campaign</h2>
            <p className="text-xs text-gray-400 leading-relaxed font-semibold">
              Share this milestone-secured fundraising campaign with your network to help reach the goal!
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                className="flex-1 px-3 py-2 rounded-lg glass-input text-xs font-mono select-all bg-black/40 border border-white/5"
                value={`${window.location.origin}/campaign/${campaign.id}`}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/campaign/${campaign.id}`);
                  setActionSuccess('Campaign sharing link copied to clipboard!');
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-xs text-white rounded-lg font-bold transition-all"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
};

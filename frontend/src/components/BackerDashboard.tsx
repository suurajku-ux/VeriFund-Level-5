import React, { useEffect, useState } from 'react';
import { StellarService, Campaign } from '../stellar';
import { Award, ShieldAlert, Heart, Calendar, ArrowUpRight } from 'lucide-react';

interface BackerDashboardProps {
  address: string;
  onSelectCampaign: (id: number) => void;
  refreshTrigger: number;
}

interface BackerContributionItem {
  campaign: Campaign;
  amount: number;
  refunded: boolean;
}

export const BackerDashboard: React.FC<BackerDashboardProps> = ({ address, onSelectCampaign, refreshTrigger }) => {
  const [contributions, setContributions] = useState<BackerContributionItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchContributions = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const items = await StellarService.getBackerContributions(address);
      setContributions(items);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContributions();
  }, [address, refreshTrigger]);

  if (!address) {
    return (
      <div className="glass-card p-8 text-center border border-white/5 max-w-md mx-auto">
        <ShieldAlert className="mx-auto h-12 w-12 text-blue-400/80 mb-3 animate-pulse" />
        <h3 className="text-lg font-bold font-outfit text-white mb-2">Wallet Disconnected</h3>
        <p className="text-sm text-gray-400">
          Please connect your Stellar wallet using the connection bar above to view your backer profile and contributions.
        </p>
      </div>
    );
  }

  const totalFunded = contributions.reduce((sum, item) => sum + item.amount, 0);
  const activeEscrows = contributions.filter(item => !item.campaign.refunded && item.campaign.status !== 'Completed').length;

  return (
    <div className="space-y-6">
      
      {/* Mini Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="glass-card p-5 border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Your Total Contributed Escrow</p>
            <h3 className="text-2xl font-black font-outfit text-white mt-1">{totalFunded.toLocaleString()} XLM</h3>
          </div>
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg">
            <Heart className="h-5 w-5" />
          </div>
        </div>

        <div className="glass-card p-5 border border-white/5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Active Escrow Campaigns</p>
            <h3 className="text-2xl font-black font-outfit text-white mt-1">{activeEscrows}</h3>
          </div>
          <div className="p-3 bg-teal-500/10 text-teal-400 rounded-lg">
            <Award className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Contributions List */}
      <div className="glass-card p-6 border border-white/10">
        <h2 className="text-xl font-bold font-outfit text-white mb-5">Your Contribution Records</h2>

        {loading ? (
          <div className="text-center py-6 text-gray-400">Loading your profile...</div>
        ) : contributions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            You haven't contributed to any escrow campaigns yet. Go to Feed to get started!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-gray-400 text-xs font-semibold uppercase">
                  <th className="pb-3 pr-4">Campaign</th>
                  <th className="pb-3 px-4">Category</th>
                  <th className="pb-3 px-4">Amount Contributed</th>
                  <th className="pb-3 px-4">Platform Escrow Status</th>
                  <th className="pb-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {contributions.map((item, idx) => {
                  const c = item.campaign;
                  return (
                    <tr key={idx} className="group hover:bg-white/5 transition-colors">
                      <td className="py-4 pr-4">
                        <div>
                          <p className="font-semibold text-white group-hover:text-blue-400 transition-colors">{c.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1 font-mono">
                            <Calendar className="h-3 w-3" /> Ends: {new Date(c.deadline * 1000).toLocaleDateString()}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-gray-300 font-medium text-xs">{c.category}</td>
                      <td className="py-4 px-4 font-bold text-teal-400">{item.amount} XLM</td>
                      <td className="py-4 px-4">
                        {item.refunded ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Proportionally Refunded
                          </span>
                        ) : c.status === 'Completed' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                            Completed & Released
                          </span>
                        ) : c.status === 'PartiallyReleased' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Active Escrow (Partially Released)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            Active Escrow (Unreleased)
                          </span>
                        )}
                      </td>
                      <td className="py-4 pl-4 text-right">
                        <button
                          onClick={() => onSelectCampaign(c.id)}
                          className="inline-flex items-center gap-0.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Details <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};

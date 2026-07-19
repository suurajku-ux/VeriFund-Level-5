import React, { useEffect, useState } from 'react';
import { StellarService, Campaign } from './stellar';
import { WalletConnect } from './components/WalletConnect';
import { CampaignFeed } from './components/CampaignFeed';
import { CreateCampaign } from './components/CreateCampaign';
import { CampaignDetail } from './components/CampaignDetail';
import { BackerDashboard } from './components/BackerDashboard';
import { Heart, Activity, FileSpreadsheet, PlusCircle, LayoutDashboard, Shield, AlertTriangle } from 'lucide-react';

function App() {
  const [address, setAddress] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState<'feed' | 'create' | 'dashboard'>('feed');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [notification, setNotification] = useState<{ message: string; campaignId: number } | null>(null);
  const [prevCampaigns, setPrevCampaigns] = useState<Campaign[]>([]);

  // Simulated Analytics Page Tracking
  useEffect(() => {
    console.log(`[Google Analytics / PostHog] PageView: /${activeTab}`);
    // If standard tracker is active, e.g. window.gtag('config', 'G-XXXXXX', { page_path: '/' + activeTab });
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await StellarService.getCampaigns();
      setCampaigns(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto restore session if simulated mock address exists
    const simMode = localStorage.getItem('verifund_sim_mode') === 'true';
    if (simMode) {
      let mockAddr = localStorage.getItem('verifund_mock_address') || 'GCHHHKNWLK6KGAVIQD5UEZ3NDLGF4POQVABLL2M3WUR5GVGKOQIECKUQ';
      if (mockAddr.length !== 56) {
        mockAddr = 'GCHHHKNWLK6KGAVIQD5UEZ3NDLGF4POQVABLL2M3WUR5GVGKOQIECKUQ';
        localStorage.setItem('verifund_mock_address', mockAddr);
      }
      setAddress(mockAddr);
    }
    // Show wizard if not completed
    const completed = localStorage.getItem('verifund_wizard_completed');
    if (!completed) {
      setShowWizard(true);
    }
  }, [refreshTrigger]);

  // Compare campaigns to trigger real-time banners for new proofs
  useEffect(() => {
    if (prevCampaigns.length > 0 && campaigns.length > 0) {
      campaigns.forEach(c => {
        const prevC = prevCampaigns.find(p => p.id === c.id);
        if (prevC) {
          c.milestones.forEach(m => {
            const prevM = prevC.milestones.find(pm => pm.milestone_id === m.milestone_id);
            if (prevM && !prevM.proof_submitted && m.proof_submitted) {
              setNotification({
                message: `Proof Hash Submitted: Campaign "${c.title}" uploaded proof for Milestone "${m.title}"!`,
                campaignId: c.id
              });
            }
          });
        }
      });
    }
    setPrevCampaigns(campaigns);
  }, [campaigns]);

  const handleCloseWizard = () => {
    localStorage.setItem('verifund_wizard_completed', 'true');
    setShowWizard(false);
  };

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col relative bg-gradient-radial">
      
      {/* In-app Notification Banner */}
      {notification && (
        <div className="fixed top-20 right-4 z-[100] max-w-sm glass-card border border-teal-500/30 p-4 bg-[#0F1D2A]/95 shadow-2xl animate-in slide-in-from-right-5 duration-300 rounded-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-teal-500/10 text-teal-400 rounded-lg">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">Proof Verification Update</h4>
              <p className="text-xs text-gray-200 mt-1 leading-relaxed">{notification.message}</p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setSelectedCampaignId(notification.campaignId);
                    setNotification(null);
                  }}
                  className="text-[10px] px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-all"
                >
                  View Campaign & Proof
                </button>
                <button
                  onClick={() => setNotification(null)}
                  className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-400 rounded font-semibold"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guided Onboarding Wizard overlay */}
      {showWizard && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="glass-card max-w-md w-full p-6 border border-white/10 relative overflow-hidden space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 rounded-2xl">
            <div className="absolute top-0 left-0 w-full h-[4px] bg-gradient-to-r from-blue-500 to-teal-400"></div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-400" />
                <h3 className="text-lg font-bold font-outfit text-white">VeriFund Onboarding Wizard</h3>
              </div>
              <span className="text-xs font-mono text-gray-500">Step {wizardStep} of 3</span>
            </div>

            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400 text-xs font-semibold leading-relaxed">
                  Welcome to VeriFund! We protect medical and emergency donations using milestone-based escrow smart contracts on Stellar.
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Unlike traditional platforms where campaigns receive a lump sum upfront, VeriFund locks contributions in a secure escrow. 
                  Funds are only released milestone-by-milestone after the creator uploads cryptographic proof receipts.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="w-full py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-bold rounded-lg text-xs transition-all"
                  >
                    Next: Connect Wallet
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  To interact with the Stellar blockchain (contribute to campaigns or create them), you need to connect a wallet. 
                  We support the **Freighter Wallet** browser extension.
                </p>
                <div className="p-3 bg-slate-900/60 rounded-lg border border-white/5 space-y-2">
                  <p className="text-xs text-gray-400 font-semibold">Instructions:</p>
                  <ul className="text-[11px] text-gray-400 list-disc list-inside space-y-1">
                    <li>Install the Freighter extension from the Chrome/Firefox Web Store.</li>
                    <li>Unlock your Freighter wallet and set the network to **Testnet**.</li>
                    <li>Click the "Connect Freighter" button in the connection bar.</li>
                  </ul>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold rounded-lg text-xs transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setWizardStep(3)}
                    className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-bold rounded-lg text-xs transition-all"
                  >
                    Next: Fund Account
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-gray-300 leading-relaxed">
                  Before contributing or deploying a campaign, you need test XLM tokens on the Stellar Testnet. 
                  You can fund your connected address instantly for free using Stellar's Friendbot service.
                </p>
                <div className="p-3 bg-teal-500/5 rounded-lg border border-teal-500/10 text-center">
                  <p className="text-xs text-teal-400 font-bold mb-1">Stellar Friendbot Funding</p>
                  <a
                    href="https://laboratory.stellar.org/#account-creator?network=testnet"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-[11px] text-blue-400 hover:underline font-mono"
                  >
                    laboratory.stellar.org (Friendbot Tool)
                  </a>
                  <p className="text-[10px] text-gray-500 mt-1">Copy your address and paste it in Friendbot to receive 10,000 test XLM.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setWizardStep(2)}
                    className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-semibold rounded-lg text-xs transition-all"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCloseWizard}
                    className="flex-1 py-2 bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-95 text-white font-bold rounded-lg text-xs transition-all shadow-lg shadow-teal-500/10"
                  >
                    Done, Let's Explore!
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decorative blurred glow spheres */}
      <div className="absolute top-[-10%] left-[20%] w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[10%] w-[350px] h-[350px] bg-teal-500/8.5 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Glass Navigation Bar */}
      <header className="sticky top-0 z-50 glass-nav">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedCampaignId(null); setActiveTab('feed'); }}>
            <div className="p-2 bg-gradient-to-r from-blue-600 to-teal-500 rounded-xl shadow-lg shadow-teal-500/10">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-extrabold font-outfit tracking-tight text-white">Veri<span className="text-gradient">Fund</span></span>
              <p className="text-[10px] text-gray-400 font-semibold tracking-wider uppercase">Soroban Crowdfunding Escrow</p>
            </div>
          </div>

          <nav className="hidden sm:flex items-center gap-1">
            <button
              onClick={() => { setSelectedCampaignId(null); setActiveTab('feed'); }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'feed' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Campaign Feed
            </button>
            <button
              onClick={() => { setSelectedCampaignId(null); setActiveTab('create'); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'create' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <PlusCircle className="h-4 w-4" /> Start Campaign
            </button>
            <button
              onClick={() => { setSelectedCampaignId(null); setActiveTab('dashboard'); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              <LayoutDashboard className="h-4 w-4" /> Backer Dashboard
            </button>
          </nav>
        </div>
      </header>

      {/* Main Wrapper */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        
        {/* Wallet Connector Banner */}
        <WalletConnect
          address={address}
          setAddress={setAddress}
          onRefresh={triggerRefresh}
        />

        {/* Dynamic Panel renderer */}
        {selectedCampaignId !== null ? (
          <CampaignDetail
            campaignId={selectedCampaignId}
            address={address}
            onBack={() => setSelectedCampaignId(null)}
            onRefresh={triggerRefresh}
          />
        ) : (
          <div>
            {activeTab === 'feed' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
                  <div>
                    <h1 className="text-3xl font-extrabold font-outfit text-white leading-none">Emergency Escrow Feed</h1>
                    <p className="text-sm text-gray-400 mt-1">Donations are locked in milestone-based escrows and released conditionally.</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-teal-500/5 text-teal-400 border border-teal-500/10 rounded-lg text-xs font-semibold">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Proof Verified Crowdfunding</span>
                  </div>
                </div>

                <CampaignFeed
                  campaigns={campaigns}
                  onSelectCampaign={setSelectedCampaignId}
                />
              </div>
            )}

            {activeTab === 'create' && (
              <CreateCampaign
                address={address}
                onSuccess={() => {
                  loadData();
                  setActiveTab('feed');
                }}
              />
            )}

            {activeTab === 'dashboard' && (
              <BackerDashboard
                address={address}
                onSelectCampaign={setSelectedCampaignId}
                refreshTrigger={refreshTrigger}
              />
            )}
          </div>
        )}
      </main>

      {/* Bottom Sticky Tabbar for Mobile Devices */}
      <div className="sm:hidden fixed bottom-0 left-0 w-full glass-nav px-4 py-2 flex justify-around items-center z-50">
        <button
          onClick={() => { setSelectedCampaignId(null); setActiveTab('feed'); }}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === 'feed' ? 'text-blue-400' : 'text-gray-500'}`}
        >
          <Activity className="h-5 w-5" />
          <span>Feed</span>
        </button>
        <button
          onClick={() => { setSelectedCampaignId(null); setActiveTab('create'); }}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === 'create' ? 'text-blue-400' : 'text-gray-500'}`}
        >
          <PlusCircle className="h-5 w-5" />
          <span>Create</span>
        </button>
        <button
          onClick={() => { setSelectedCampaignId(null); setActiveTab('dashboard'); }}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold ${activeTab === 'dashboard' ? 'text-blue-400' : 'text-gray-500'}`}
        >
          <LayoutDashboard className="h-5 w-5" />
          <span>Dashboard</span>
        </button>
      </div>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-gray-500 mt-12 pb-16 sm:pb-8">
        <p>© 2026 VeriFund platform. Powered by Soroban & Stellar.</p>
        <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-gray-600">
          <FileSpreadsheet className="h-3 w-3" /> Level 5 Blue Belt Expansion & Scalability Submission.
        </p>
      </footer>
    </div>
  );
}

export default App;

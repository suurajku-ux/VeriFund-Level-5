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
  }, [refreshTrigger]);

  const triggerRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-[#0B0F19] text-gray-100 flex flex-col relative bg-gradient-radial">
      
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
          <FileSpreadsheet className="h-3 w-3" /> Level 4 Green Belt Crowd Control Submission.
        </p>
      </footer>
    </div>
  );
}

export default App;

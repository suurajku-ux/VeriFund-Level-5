import React, { useEffect, useState } from 'react';
import { StellarService, getUseSimulation, setUseSimulation } from '../stellar';
import { Wallet, ShieldAlert, Cpu, Network } from 'lucide-react';

interface WalletConnectProps {
  address: string;
  setAddress: (addr: string) => void;
  onRefresh: () => void;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({ address, setAddress, onRefresh }) => {
  const [isInstalled, setIsInstalled] = useState(false);
  const [simMode, setSimMode] = useState(getUseSimulation());
  const [balance, setBalance] = useState(1000); // Default simulated balance

  useEffect(() => {
    StellarService.isFreighterInstalled().then(setIsInstalled);
    if (address) {
      // In a real app we'd query Horizon balance, here we use a persistent simulated balance or default
      const savedBal = localStorage.getItem(`verifund_balance_${address}`);
      if (savedBal) setBalance(Number(savedBal));
      else {
        localStorage.setItem(`verifund_balance_${address}`, '1000');
        setBalance(1000);
      }
    }
  }, [address]);

  const handleConnect = async () => {
    try {
      const addr = await StellarService.getWalletAddress();
      setAddress(addr);
      onRefresh();
    } catch (e) {
      alert('Could not connect wallet. If you do not have Freighter, please use Simulation Mode.');
    }
  };

  const handleToggleMode = () => {
    const nextMode = !simMode;
    setSimMode(nextMode);
    setUseSimulation(nextMode);
  };

  const handleAddFunds = () => {
    const newBal = balance + 500;
    setBalance(newBal);
    localStorage.setItem(`verifund_balance_${address}`, String(newBal));
    onRefresh();
  };

  const shortenAddress = (addr: string) => {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 glass-card border border-white/10 mb-8">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-semibold font-outfit text-white">Wallet Connection</h2>
          {address ? (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-gray-400">{shortenAddress(address)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-400 border border-teal-500/30">
                {balance.toLocaleString()} XLM
              </span>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Connect wallet to contribute or manage campaigns</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Toggle Mode Button */}
        <button
          onClick={handleToggleMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            simMode
              ? 'bg-blue-600/15 text-blue-400 border-blue-500/30 hover:bg-blue-600/25'
              : 'bg-teal-600/15 text-teal-400 border-teal-500/30 hover:bg-teal-600/25'
          }`}
        >
          {simMode ? <Cpu className="h-4 w-4" /> : <Network className="h-4 w-4" />}
          Mode: {simMode ? 'Local Sim' : 'Stellar Testnet'}
        </button>

        {address ? (
          <>
            {simMode && (
              <button
                onClick={handleAddFunds}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-teal-500/10 text-teal-400 border border-teal-500/30 hover:bg-teal-500/20 transition-all"
              >
                +500 Sim XLM
              </button>
            )}
            <button
              onClick={() => {
                setAddress('');
                localStorage.removeItem('verifund_mock_address');
              }}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/5 text-gray-300 hover:bg-white/10 transition-all border border-white/5"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-500/20"
          >
            Connect Wallet
          </button>
        )}
      </div>

      {!isInstalled && !simMode && (
        <div className="w-full flex items-center gap-2 p-2 mt-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>Freighter Extension is not installed. Enable simulation mode or install Freighter.</span>
        </div>
      )}
    </div>
  );
};

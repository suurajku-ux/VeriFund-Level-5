import { isConnected, getAddress, signTransaction, requestAccess } from '@stellar/freighter-api';
import * as StellarSdk from '@stellar/stellar-sdk';

export interface Milestone {
  milestone_id: number;
  title: string;
  amount: number;
  proof_submitted: boolean;
  released: boolean;
  proof_hash?: string;
  proof_timestamp?: number;
}

export interface Campaign {
  id: number;
  creator: string;
  title: string;
  description: string;
  category: string;
  goal_amount: number;
  total_raised: number;
  deadline: number; // unix timestamp seconds
  milestones: Milestone[];
  refunded: boolean;
  status: 'Active' | 'PartiallyReleased' | 'Completed' | 'Refunded';
}

export interface Contribution {
  campaignId: number;
  backer: string;
  amount: number;
  refunded: boolean;
}

const SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';

// Deployed contract ID on Testnet (overwritten by deploy.sh)
let CONTRACT_ID = 'CBK7BZDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQDQVERIFUND';
try {
  // @ts-ignore
  import('./contract_address.json').then((module) => {
    CONTRACT_ID = module.contract_address || CONTRACT_ID;
  }).catch(() => {
    // ignore
  });
} catch (_) {
  // ignore
}

// Check if we are in Simulation Mode or Live Mode
export const getUseSimulation = (): boolean => {
  const val = localStorage.getItem('verifund_sim_mode');
  return val === null ? false : val === 'true'; // Default to Live Soroban mode!
};

export const setUseSimulation = (useSim: boolean) => {
  localStorage.setItem('verifund_sim_mode', useSim ? 'true' : 'false');
  window.location.reload();
};

// Seed initial campaigns for simulation mode to give a rich UI out of the box
const seedSimulationDB = () => {
  if (localStorage.getItem('verifund_seeded')) return;

  const sampleCampaigns: Campaign[] = [
    {
      id: 1,
      creator: 'GBM4SUR3PJN637T72X7M6YQDJK6V36LNZ2MHSJ7KRYA6L3XSLFCE2X2U',
      title: 'Emergency Heart Surgery for Baby Sarah',
      description: 'Baby Sarah was diagnosed with a congenital heart defect. Funds will cover the surgery advance and ICU stay.',
      category: 'Medical',
      goal_amount: 1000,
      total_raised: 1000,
      deadline: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
      milestones: [
        { milestone_id: 1, title: 'Surgery Advance Deposit', amount: 600, proof_submitted: true, released: true, proof_hash: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae', proof_timestamp: Math.floor(Date.now() / 1000) - 30 },
        { milestone_id: 2, title: 'Post-op Cardiac Medicines', amount: 400, proof_submitted: false, released: false }
      ],
      refunded: false,
      status: 'PartiallyReleased'
    },
    {
      id: 2,
      creator: 'GDKXN2R7RHY4HYGJKMNDRTY5A6LNZ2MHSJ7KRYA6L3XSLFCE2X2U',
      title: 'Chemotherapy Plan for Elena (Stage 3 Lymphoma)',
      description: 'Elena needs 6 rounds of intensive chemotherapy. We are raising funds to cover cycles 1-3 and cycles 4-6.',
      category: 'Cancer Care',
      goal_amount: 2000,
      total_raised: 1200,
      deadline: Math.floor(Date.now() / 1000) + 86400 * 15, // 15 days from now
      milestones: [
        { milestone_id: 1, title: 'First 3 Cycles & Port Placement', amount: 1000, proof_submitted: false, released: false },
        { milestone_id: 2, title: 'Remaining 3 Cycles & Scans', amount: 1000, proof_submitted: false, released: false }
      ],
      refunded: false,
      status: 'Active'
    }
  ];

  const sampleContributions: Contribution[] = [
    { campaignId: 1, backer: 'GC2BMR4SUR3PJN637T72X7M6YQDJK6V36LNZ2MHSJ7KRYA6L3XSLFCE2A', amount: 600, refunded: false },
    { campaignId: 1, backer: 'GDH6N2R7RHY4HYGJKMNDRTY5A6LNZ2MHSJ7KRYA6L3XSLFCE2B', amount: 400, refunded: false },
    { campaignId: 2, backer: 'GC2BMR4SUR3PJN637T72X7M6YQDJK6V36LNZ2MHSJ7KRYA6L3XSLFCE2A', amount: 1200, refunded: false }
  ];

  localStorage.setItem('verifund_campaigns', JSON.stringify(sampleCampaigns));
  localStorage.setItem('verifund_contributions', JSON.stringify(sampleContributions));
  localStorage.setItem('verifund_seeded', 'true');
};

seedSimulationDB();

// Simulated Storage Helper Functions
const getSimCampaigns = (): Campaign[] => {
  return JSON.parse(localStorage.getItem('verifund_campaigns') || '[]');
};

const saveSimCampaigns = (campaigns: Campaign[]) => {
  localStorage.setItem('verifund_campaigns', JSON.stringify(campaigns));
};

const getSimContributions = (): Contribution[] => {
  return JSON.parse(localStorage.getItem('verifund_contributions') || '[]');
};

const saveSimContributions = (contribs: Contribution[]) => {
  localStorage.setItem('verifund_contributions', JSON.stringify(contribs));
};

// Helper to convert Milestone to ScVal structure
function milestoneToScVal(m: { milestone_id: number, title: string, amount: number }) {
  // Sort keys alphabetically: amount, milestone_id, proof_submitted, released, title
  return StellarSdk.xdr.ScVal.scvMap(new (StellarSdk.xdr.ScMap as any)([
    new (StellarSdk.xdr.ScMapEntry as any)({
      key: StellarSdk.nativeToScVal('amount'),
      val: StellarSdk.nativeToScVal(BigInt(m.amount), { type: 'i128' })
    }),
    new (StellarSdk.xdr.ScMapEntry as any)({
      key: StellarSdk.nativeToScVal('milestone_id'),
      val: StellarSdk.nativeToScVal(m.milestone_id, { type: 'u32' })
    }),
    new (StellarSdk.xdr.ScMapEntry as any)({
      key: StellarSdk.nativeToScVal('proof_submitted'),
      val: StellarSdk.nativeToScVal(false, { type: 'bool' })
    }),
    new (StellarSdk.xdr.ScMapEntry as any)({
      key: StellarSdk.nativeToScVal('released'),
      val: StellarSdk.nativeToScVal(false, { type: 'bool' })
    }),
    new (StellarSdk.xdr.ScMapEntry as any)({
      key: StellarSdk.nativeToScVal('title'),
      val: StellarSdk.nativeToScVal(m.title, { type: 'string' })
    })
  ]));
}

// Helper to call read-only Soroban contract functions via simulation
async function simulateCall(funcName: string, args: StellarSdk.xdr.ScVal[] = []): Promise<any> {
  const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);
  const op = StellarSdk.Operation.invokeContractFunction({
    contract: CONTRACT_ID,
    function: funcName,
    args: args
  });
  const sourceAccount = new StellarSdk.Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
  const tx = new StellarSdk.TransactionBuilder(sourceAccount, { fee: "100" })
    .addOperation(op)
    .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
    .setTimeout(StellarSdk.TimeoutInfinite)
    .build();
  
  const sim = await server.simulateTransaction(tx);
  const simAny = sim as any;
  if (simAny.result) {
    return StellarSdk.scValToNative(simAny.result.retval);
  }
  throw new Error(`Simulation failed for ${funcName}`);
}

// Helper to submit a transaction to the Soroban RPC network
async function submitSorobanTransaction(funcName: string, args: StellarSdk.xdr.ScVal[]): Promise<string> {
  const address = await StellarService.getWalletAddress();
  const server = new StellarSdk.rpc.Server(SOROBAN_RPC_URL);

  // Load account sequence from Horizon
  const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
  if (!res.ok) throw new Error("Failed to load backer account details from Testnet.");
  const accountData = await res.json();
  const sourceAccount = new StellarSdk.Account(address, accountData.sequence);

  // Build contract invocation operation
  const op = StellarSdk.Operation.invokeContractFunction({
    contract: CONTRACT_ID,
    function: funcName,
    args: args
  });

  const tx = new StellarSdk.TransactionBuilder(sourceAccount, { fee: "100" })
    .addOperation(op)
    .setNetworkPassphrase(StellarSdk.Networks.TESTNET)
    .setTimeout(StellarSdk.TimeoutInfinite)
    .build();

  // Simulate to acquire footprint
  const sim = await server.simulateTransaction(tx);
  const simAny = sim as any;
  if (!simAny.result) {
    throw new Error(`Simulation failed for transaction ${funcName}. Check Freighter network or balance.`);
  }

  // Assemble footprint into tx
  const assembledTx = StellarSdk.rpc.assembleTransaction(tx, sim) as any;

  // Request Freighter Signature
  const xdr = assembledTx.toXDR();
  const signResult = await signTransaction(xdr, { network: 'TESTNET' } as any) as any;
  const signedXDR = signResult.signedTxXdr || signResult;
  const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXDR, StellarSdk.Networks.TESTNET);

  // Submit to Ledger
  let response = await server.sendTransaction(signedTx) as any;
  if (response.status === "PENDING" || response.status === "SUCCESS") {
    const txHash = response.hash;
    let status = response.status as any;
    let pollCount = 0;
    while (status === "PENDING" && pollCount < 10) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const txResult = await server.getTransaction(txHash) as any;
      status = txResult.status;
      if (status === "SUCCESS") {
        return txHash;
      }
      if (status === "FAILED") {
        throw new Error(`Transaction execution failed on ledger: ${txResult.status}`);
      }
      pollCount++;
    }
    return txHash;
  } else {
    throw new Error(`Transaction submission failed: ${response.errorResultXdr || response.status}`);
  }
}

// Main Service Implementation
export const StellarService = {
  isFreighterInstalled: async (): Promise<boolean> => {
    try {
      const check = await isConnected();
      if (typeof check === 'boolean') return check;
      return !!(check && (check as any).isConnected);
    } catch {
      return false;
    }
  },

  getWalletAddress: async (): Promise<string> => {
    if (getUseSimulation()) {
      let mockAddr = localStorage.getItem('verifund_mock_address');
      if (!mockAddr) {
        mockAddr = 'GC2BMR4SUR3PJN637T72X7M6YQDJK6V36LNZ2MHSJ7KRYA6L3XSLFCE2A';
        localStorage.setItem('verifund_mock_address', mockAddr);
      }
      return mockAddr;
    }

    try {
      const result = await requestAccess();
      if (result.error) {
        throw new Error(result.error);
      }
      return result.address || '';
    } catch (e) {
      // Fallback in case of older Freighter API methods
      try {
        const address = await getAddress();
        if (typeof address === 'string') return address;
        return (address && (address as any).address) || '';
      } catch (inner) {
        throw new Error('Wallet connection failed: ' + e);
      }
    }
  },

  getCampaigns: async (): Promise<Campaign[]> => {
    if (getUseSimulation()) {
      return getSimCampaigns();
    }

    // Soroban Live mode integration
    try {
      const count = await simulateCall('get_campaign_count');
      const campaignCount = Number(count);
      const campaigns: Campaign[] = [];

      for (let id = 1; id <= campaignCount; id++) {
        try {
          const nativeCampaign = await simulateCall('get_campaign', [StellarSdk.nativeToScVal(BigInt(id), { type: 'u64' })]);
          const statusNative = await simulateCall('get_campaign_status', [StellarSdk.nativeToScVal(BigInt(id), { type: 'u64' })]);

          // Fetch user-configured metadata from localStorage, or use safe fallbacks
          const localMeta = JSON.parse(localStorage.getItem(`verifund_meta_${id}`) || '{}');
          
          const campaign: Campaign = {
            id: id,
            creator: nativeCampaign.creator,
            title: localMeta.title || `Campaign #${id}`,
            description: localMeta.description || `Milestone-based medical fundraising escrow campaign #${id} deployed on Stellar.`,
            category: localMeta.category || 'Medical',
            goal_amount: Number(nativeCampaign.goal_amount),
            total_raised: Number(nativeCampaign.total_raised),
            deadline: Number(nativeCampaign.deadline),
            milestones: nativeCampaign.milestones.map((m: any) => ({
              milestone_id: Number(m.milestone_id),
              title: m.title.toString(),
              amount: Number(m.amount),
              proof_submitted: !!m.proof_submitted,
              released: !!m.released
            })),
            refunded: !!nativeCampaign.refunded,
            status: statusNative === 0 ? 'Active' : statusNative === 1 ? 'PartiallyReleased' : statusNative === 2 ? 'Completed' : 'Refunded'
          };

          campaigns.push(campaign);
        } catch (innerErr) {
          console.warn(`Error loading campaign #${id} details:`, innerErr);
        }
      }
      return campaigns;
    } catch (error) {
      console.error("Soroban read error, using fallback storage:", error);
      return []; // Return empty list rather than fake data if live call fails
    }
  },

  createCampaign: async (
    title: string,
    description: string,
    category: string,
    goal: number,
    deadlineSecs: number,
    milestones: { title: string; amount: number }[]
  ): Promise<string> => {
    const creator = await StellarService.getWalletAddress();

    if (getUseSimulation()) {
      const campaigns = getSimCampaigns();
      const newId = campaigns.length + 1;
      const formattedMilestones: Milestone[] = milestones.map((m, index) => ({
        milestone_id: index + 1,
        title: m.title,
        amount: m.amount,
        proof_submitted: false,
        released: false
      }));

      const newCampaign: Campaign = {
        id: newId,
        creator,
        title,
        description,
        category,
        goal_amount: goal,
        total_raised: 0,
        deadline: deadlineSecs,
        milestones: formattedMilestones,
        refunded: false,
        status: 'Active'
      };

      campaigns.push(newCampaign);
      saveSimCampaigns(campaigns);
      return `sim_tx_create_${newId}_${Date.now()}`;
    }

    // Soroban Live transaction build & submission
    try {
      const milestoneVec = StellarSdk.xdr.ScVal.scvVec(milestones.map((m, idx) => milestoneToScVal({
        milestone_id: idx + 1,
        title: m.title,
        amount: m.amount
      })));

      const args = [
        StellarSdk.nativeToScVal(creator, { type: 'address' }),
        StellarSdk.nativeToScVal(BigInt(goal), { type: 'i128' }),
        StellarSdk.nativeToScVal(BigInt(deadlineSecs), { type: 'u64' }),
        milestoneVec
      ];

      const txHash = await submitSorobanTransaction('create_campaign', args);
      
      // Save campaign metadata locally keyed by the expected new index
      const count = await simulateCall('get_campaign_count');
      const nextId = Number(count) + 1;
      localStorage.setItem(`verifund_meta_${nextId}`, JSON.stringify({ title, description, category }));

      return txHash;
    } catch (error) {
      console.error(error);
      throw error;
    }
  },

  contribute: async (campaignId: number, amount: number): Promise<string> => {
    const backer = await StellarService.getWalletAddress();

    if (getUseSimulation()) {
      const campaigns = getSimCampaigns();
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found');

      if (campaign.refunded || Date.now() / 1000 >= campaign.deadline) {
        throw new Error('Campaign is ended or already finalized');
      }

      campaign.total_raised += amount;
      
      const contribs = getSimContributions();
      const existing = contribs.find(c => c.campaignId === campaignId && c.backer === backer);
      if (existing) {
        existing.amount += amount;
      } else {
        contribs.push({ campaignId, backer, amount, refunded: false });
      }

      saveSimCampaigns(campaigns);
      saveSimContributions(contribs);
      return `sim_tx_contribute_${campaignId}_${Date.now()}`;
    }

    // Soroban Live contribution call
    try {
      const args = [
        StellarSdk.nativeToScVal(BigInt(campaignId), { type: 'u64' }),
        StellarSdk.nativeToScVal(backer, { type: 'address' }),
        StellarSdk.nativeToScVal(BigInt(amount), { type: 'i128' })
      ];
      return await submitSorobanTransaction('contribute', args);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  submitProof: async (campaignId: number, milestoneId: number, fileHash: string): Promise<string> => {
    if (getUseSimulation()) {
      const creator = await StellarService.getWalletAddress();
      const campaigns = getSimCampaigns();
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found');

      if (campaign.creator !== creator) {
        throw new Error('Unauthorized: Only campaign creator can submit proof');
      }

      const milestone = campaign.milestones.find(m => m.milestone_id === milestoneId);
      if (!milestone) throw new Error('Milestone not found');

      milestone.proof_submitted = true;
      milestone.proof_hash = fileHash;
      milestone.proof_timestamp = Math.floor(Date.now() / 1000);

      saveSimCampaigns(campaigns);
      return `sim_tx_proof_${campaignId}_${milestoneId}_${Date.now()}`;
    }

    // Soroban Live submit proof call
    try {
      // Convert SHA-256 Hex string back to BytesN<32>
      const hashBytes = Buffer.from(fileHash, 'hex');
      const proofSc = StellarSdk.xdr.ScVal.scvBytes(hashBytes);

      const args = [
        StellarSdk.nativeToScVal(BigInt(campaignId), { type: 'u64' }),
        StellarSdk.nativeToScVal(milestoneId, { type: 'u32' }),
        proofSc
      ];
      return await submitSorobanTransaction('submit_proof', args);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  releaseMilestone: async (campaignId: number, milestoneId: number): Promise<string> => {
    if (getUseSimulation()) {
      const campaigns = getSimCampaigns();
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found');

      if (campaign.total_raised < campaign.goal_amount) {
        throw new Error('Goal not met yet: milestone cannot be released');
      }

      const milestone = campaign.milestones.find(m => m.milestone_id === milestoneId);
      if (!milestone) throw new Error('Milestone not found');

      if (!milestone.proof_submitted) {
        throw new Error('Milestone proof is missing');
      }

      if (milestone.released) {
        throw new Error('Milestone is already released');
      }

      milestone.released = true;
      
      const allReleased = campaign.milestones.every(m => m.released);
      if (allReleased) {
        campaign.status = 'Completed';
      } else {
        campaign.status = 'PartiallyReleased';
      }

      saveSimCampaigns(campaigns);
      return `sim_tx_release_${campaignId}_${milestoneId}_${Date.now()}`;
    }

    // Soroban Live release milestone call
    try {
      const args = [
        StellarSdk.nativeToScVal(BigInt(campaignId), { type: 'u64' }),
        StellarSdk.nativeToScVal(milestoneId, { type: 'u32' })
      ];
      return await submitSorobanTransaction('release_milestone', args);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  finalizeOrRefund: async (campaignId: number): Promise<string> => {
    if (getUseSimulation()) {
      const campaigns = getSimCampaigns();
      const campaign = campaigns.find(c => c.id === campaignId);
      if (!campaign) throw new Error('Campaign not found');

      if (campaign.refunded) {
        throw new Error('Already finalized');
      }

      if (Date.now() / 1000 < campaign.deadline) {
        throw new Error('Deadline has not passed yet');
      }

      const totalRaised = campaign.total_raised;
      const goalAmount = campaign.goal_amount;
      const contribs = getSimContributions().filter(c => c.campaignId === campaignId);

      if (totalRaised < goalAmount) {
        contribs.forEach(c => {
          c.refunded = true;
        });
      } else {
        const unprovenTotal = campaign.milestones
          .filter(m => !m.proof_submitted)
          .reduce((sum, m) => sum + m.amount, 0);

        if (unprovenTotal > 0) {
          contribs.forEach(c => {
            const refundShare = (c.amount * unprovenTotal) / totalRaised;
            c.refunded = true;
          });
        }
      }

      campaign.refunded = true;
      campaign.status = 'Refunded';

      saveSimCampaigns(campaigns);
      
      const allContribs = getSimContributions();
      const updatedContribs = allContribs.map(ac => {
        const matching = contribs.find(c => c.backer === ac.backer && c.campaignId === ac.campaignId);
        return matching ? { ...ac, refunded: true } : ac;
      });
      saveSimContributions(updatedContribs);

      return `sim_tx_finalize_${campaignId}_${Date.now()}`;
    }

    // Soroban Live finalize call
    try {
      const args = [
        StellarSdk.nativeToScVal(BigInt(campaignId), { type: 'u64' })
      ];
      return await submitSorobanTransaction('finalize_or_refund', args);
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  getBackerContributions: async (backer: string): Promise<{ campaign: Campaign; amount: number; refunded: boolean }[]> => {
    if (getUseSimulation()) {
      const contribs = getSimContributions().filter(c => c.backer === backer);
      const campaigns = getSimCampaigns();
      
      return contribs.map(c => {
        const camp = campaigns.find(cam => cam.id === c.campaignId)!;
        return {
          campaign: camp,
          amount: c.amount,
          refunded: c.refunded
        };
      });
    }

    // Soroban Live backer contributions retrieval
    try {
      const campaigns = await StellarService.getCampaigns();
      const results: { campaign: Campaign; amount: number; refunded: boolean }[] = [];

      for (const c of campaigns) {
        try {
          const amount = await simulateCall('get_backer_contribution', [
            StellarSdk.nativeToScVal(BigInt(c.id), { type: 'u64' }),
            StellarSdk.nativeToScVal(backer, { type: 'address' })
          ]);
          const contribAmt = Number(amount);
          if (contribAmt > 0) {
            results.push({
              campaign: c,
              amount: contribAmt,
              refunded: c.refunded // If finalized, it is refunded
            });
          }
        } catch (_) {
          // ignore individual lookup fails
        }
      }
      return results;
    } catch (e) {
      console.error(e);
      return [];
    }
  }
};

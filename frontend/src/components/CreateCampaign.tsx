import React, { useState } from 'react';
import { StellarService } from '../stellar';
import { Plus, Trash2, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

interface CreateCampaignProps {
  address: string;
  onSuccess: () => void;
}

export const CreateCampaign: React.FC<CreateCampaignProps> = ({ address, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Medical');
  const [goal, setGoal] = useState<number>(1000);
  const [deadlineDays, setDeadlineDays] = useState<number>(7);
  const [milestones, setMilestones] = useState<{ title: string; amount: number }[]>([
    { title: 'Surgery / Main Procedure', amount: 600 },
    { title: 'Hospitalization & Medication', amount: 400 }
  ]);
  const [verifiedNgo, setVerifiedNgo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleAddMilestone = () => {
    setMilestones([...milestones, { title: '', amount: 0 }]);
  };

  const handleRemoveMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleMilestoneChange = (index: number, field: 'title' | 'amount', value: string | number) => {
    const updated = [...milestones];
    if (field === 'title') {
      updated[index].title = value as string;
    } else {
      updated[index].amount = Number(value);
    }
    setMilestones(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!address) {
      setError('Please connect your wallet first.');
      return;
    }

    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.');
      return;
    }

    if (goal <= 0) {
      setError('Goal amount must be positive.');
      return;
    }

    if (milestones.length === 0) {
      setError('At least one milestone is required.');
      return;
    }

    const milestoneSum = milestones.reduce((sum, m) => sum + m.amount, 0);
    if (milestoneSum !== goal) {
      setError(`Milestone amounts (${milestoneSum} XLM) must sum up to the total goal (${goal} XLM).`);
      return;
    }

    if (milestones.some(m => !m.title.trim() || m.amount <= 0)) {
      setError('All milestones must have a valid title and positive amount.');
      return;
    }

    setLoading(true);

    try {
      const deadlineSecs = Math.floor(Date.now() / 1000) + (deadlineDays * 86400);
      await StellarService.createCampaign(
        title,
        description,
        category,
        goal,
        deadlineSecs,
        milestones,
        verifiedNgo
      );
      setSuccess(true);
      setTitle('');
      setVerifiedNgo(false);
      setDescription('');
      setGoal(1000);
      setMilestones([
        { title: 'Surgery / Main Procedure', amount: 600 },
        { title: 'Hospitalization & Medication', amount: 400 }
      ]);
      onSuccess();
    } catch (e: any) {
      setError(e.message || 'Transaction failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto glass-card p-6 border border-white/10 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-blue-500 to-teal-400"></div>
      
      <h2 className="text-2xl font-bold font-outfit text-white mb-6">Start a Crowdfunding Campaign</h2>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-lg mb-6">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm rounded-lg mb-6">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Campaign created successfully on-chain! Go to Feed to contribute.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">Campaign Title</label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-lg glass-input text-sm"
            placeholder="e.g. Elena's Heart Transplant Fund"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">Category</label>
            <select
              className="w-full px-4 py-2.5 rounded-lg glass-input text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Medical">Medical / Emergency</option>
              <option value="Cancer Care">Cancer Care</option>
              <option value="Disaster Relief">Disaster Relief</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1.5">Duration (Days)</label>
            <input
              type="number"
              min="1"
              max="90"
              className="w-full px-4 py-2.5 rounded-lg glass-input text-sm"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/10">
          <input
            type="checkbox"
            id="verifiedNgo"
            className="w-4 h-4 rounded border-white/10 text-blue-600 focus:ring-blue-500 accent-blue-500 cursor-pointer"
            checked={verifiedNgo}
            onChange={(e) => setVerifiedNgo(e.target.checked)}
          />
          <label htmlFor="verifiedNgo" className="text-sm font-medium text-gray-300 select-none cursor-pointer">
            NGO / Hospital-Partnered Campaign (Verified NGO Badge)
          </label>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-1.5">Short Story / Description</label>
          <textarea
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg glass-input text-sm"
            placeholder="Describe the medical situation, milestones, and how the funds will be used..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className="border-t border-white/5 pt-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300">Total Goal (XLM)</label>
              <p className="text-xs text-gray-400">Milestone portions must sum up to this goal</p>
            </div>
            <input
              type="number"
              min="1"
              className="w-32 px-4 py-2 rounded-lg glass-input text-sm font-bold text-right"
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
              required
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Milestones Breakdown</span>
              <button
                type="button"
                onClick={handleAddMilestone}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-all font-semibold"
              >
                <Plus className="h-3 w-3" /> Add Milestone
              </button>
            </div>

            {milestones.map((m, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder={`Milestone #${index + 1} Title`}
                  className="flex-1 px-3 py-2 rounded-lg glass-input text-xs"
                  value={m.title}
                  onChange={(e) => handleMilestoneChange(index, 'title', e.target.value)}
                  required
                />
                <input
                  type="number"
                  placeholder="Amount"
                  className="w-24 px-3 py-2 rounded-lg glass-input text-xs text-right font-semibold"
                  value={m.amount || ''}
                  onChange={(e) => handleMilestoneChange(index, 'amount', e.target.value)}
                  required
                />
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(index)}
                    className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !address}
          className="w-full mt-6 py-3 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-600 to-teal-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 text-white shadow-lg shadow-teal-500/10"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Deploying Campaign Smart Contract...
            </>
          ) : (
            'Deploy VeriFund Escrow Campaign'
          )}
        </button>
      </form>
    </div>
  );
};

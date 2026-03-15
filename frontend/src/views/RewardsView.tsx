import { useState, useEffect } from "react";
import { useAppContext } from "../contexts/AppContext";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import PinPrompt from "../components/Common/PinPrompt";
import RewardModal from "../components/Common/RewardModal";
import FloatingActionButton from "../components/Common/FloatingActionButton";
import { serviceRedeemReward, serviceAddReward, serviceDeleteReward } from "../lib/skyDarkApi";
import type { Reward } from "../types/rewards";

const STORAGE_REWARDS = "skydark_rewards";
const STORAGE_POINTS = "skydark_rewards_points";

const DEFAULT_REWARDS: Reward[] = [
  { id: "r1", name: "Ice cream trip", points: 50 },
  { id: "r2", name: "Movie night", points: 100 },
  { id: "r3", name: "Extra screen time", points: 25 },
];

const DEFAULT_POINTS: Record<string, number> = { "1": 30, "2": 45, "3": 10, "4": 80 };

function loadRewards(): Reward[] {
  try {
    const raw = localStorage.getItem(STORAGE_REWARDS);
    if (raw) {
      const parsed = JSON.parse(raw) as Reward[];
      if (Array.isArray(parsed) && parsed.length >= 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_REWARDS;
}

function loadPoints(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_POINTS);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_POINTS };
}

export default function RewardsView() {
  const skydark = useSkydarkDataContext();
  const { familyMembers, verifyPin, isFeatureLocked } = useAppContext();
  const [localRewards, setLocalRewards] = useState<Reward[]>(loadRewards);
  const [localPoints, setLocalPoints] = useState<Record<string, number>>(loadPoints);
  const [showRedeemPin, setShowRedeemPin] = useState(false);
  const [pendingRedeem, setPendingRedeem] = useState<{ memberId: string; rewardId: string; cost: number } | null>(null);
  const [showManagePin, setShowManagePin] = useState(false);
  const [pendingManageAction, setPendingManageAction] = useState<"add" | { delete: string } | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const serverPoints = skydark?.data?.connection ? (skydark.data.pointsByMember ?? {}) : {};
  const serverRewards: Reward[] = skydark?.data?.connection && skydark.data.rewards
    ? skydark.data.rewards.map((r) => ({ id: r.id, name: r.name, points: r.points_required }))
    : [];
  const points = skydark?.data?.connection ? serverPoints : localPoints;
  const rewards = skydark?.data?.connection ? serverRewards : localRewards;

  useEffect(() => {
    if (!skydark?.data?.connection) try { localStorage.setItem(STORAGE_REWARDS, JSON.stringify(localRewards)); } catch { /* ignore */ }
  }, [skydark?.data?.connection, localRewards]);
  useEffect(() => {
    if (!skydark?.data?.connection) try { localStorage.setItem(STORAGE_POINTS, JSON.stringify(localPoints)); } catch { /* ignore */ }
  }, [skydark?.data?.connection, localPoints]);

  const handleRedeemClick = (memberId: string, rewardId: string, cost: number) => {
    if ((points[memberId] ?? 0) < cost) return;
    if (isFeatureLocked("claimRewards")) {
      setPendingRedeem({ memberId, rewardId, cost });
      setShowRedeemPin(true);
    } else {
      doRedeem(memberId, rewardId, cost);
    }
  };

  const doRedeem = async (memberId: string, rewardId: string, _cost: number) => {
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceRedeemReward(conn, { member_id: memberId, reward_id: rewardId });
        await skydark?.refetch();
      } catch {
        // leave as-is
      }
      return;
    }
    setLocalPoints((prev) => ({ ...prev, [memberId]: Math.max(0, (prev[memberId] ?? 0) - _cost) }));
  };

  const handleRedeemPinVerify = (pin: string): boolean => {
    if (!verifyPin(pin)) return false;
    setShowRedeemPin(false);
    if (pendingRedeem) {
      doRedeem(pendingRedeem.memberId, pendingRedeem.rewardId, pendingRedeem.cost);
      setPendingRedeem(null);
    }
    return true;
  };

  const requestAddReward = () => {
    if (isFeatureLocked("addRewards")) {
      setPendingManageAction("add");
      setShowManagePin(true);
    } else {
      setAddModalOpen(true);
    }
  };

  const handleDeleteReward = async (rewardId: string) => {
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceDeleteReward(conn, { reward_id: rewardId });
        await skydark?.refetch();
      } catch {
        // leave as-is on error
      }
    } else {
      setLocalRewards((prev) => prev.filter((r) => r.id !== rewardId));
    }
    setAddModalOpen(false);
  };

  const requestDeleteReward = (rewardId: string) => {
    if (isFeatureLocked("addRewards")) {
      setPendingManageAction({ delete: rewardId });
      setShowManagePin(true);
    } else {
      handleDeleteReward(rewardId);
    }
  };

  const handleManagePinVerify = (pin: string): boolean => {
    if (!verifyPin(pin)) return false;
    setShowManagePin(false);
    if (pendingManageAction === "add") {
      setAddModalOpen(true);
    } else if (pendingManageAction && "delete" in pendingManageAction) {
      handleDeleteReward(pendingManageAction.delete);
    }
    setPendingManageAction(null);
    return true;
  };

  const getManagePinTitle = () => {
    if (pendingManageAction === "add") return "Enter PIN to add reward";
    if (pendingManageAction && "delete" in pendingManageAction) return "Enter PIN to delete reward";
    return "Enter PIN";
  };

  const handleSaveReward = async (data: Omit<Reward, "id">) => {
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceAddReward(conn, {
          name: data.name,
          points_required: data.points,
        });
        await skydark?.refetch();
      } catch {
        // leave as-is
      }
    } else {
      setLocalRewards((prev) => [...prev, { ...data, id: `r${Date.now()}` }]);
    }
    setAddModalOpen(false);
  };

  return (
    <div className="h-full">
      <h2 className="text-lg font-semibold text-skydark-text mb-4">Rewards</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-skydark-text-secondary mb-3">Points</h3>
          <div className="space-y-3">
            {familyMembers.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 p-3 rounded-card bg-white shadow-skydark"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold"
                  style={{ backgroundColor: m.color }}
                >
                  {m.initial}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-skydark-text">{m.name}</div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden"
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ((points[m.id] || 0) / 100) * 100)}%`,
                          backgroundColor: m.color,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-skydark-text">
                      {points[m.id] || 0} pts
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-skydark-text-secondary mb-3">Redeem</h3>
          <ul className="space-y-2">
            {rewards.map((r) => {
              const eligibleMembers = familyMembers.filter((m) => (points[m.id] ?? 0) >= r.points);
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-card bg-white shadow-skydark"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-skydark-text font-medium">{r.name}</span>
                    <span className="text-skydark-text-secondary text-sm ml-2">
                      {r.points} pts
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
                    <div
                      className={`flex gap-1 items-center overflow-x-auto pb-1 ${eligibleMembers.length > 5 ? "max-w-[12rem]" : ""}`}
                      style={{ scrollbarGutter: "stable" }}
                    >
                      {eligibleMembers.length === 0 ? (
                        <span className="text-sm text-skydark-text-secondary italic whitespace-nowrap">
                          No one has enough points
                        </span>
                      ) : (
                        eligibleMembers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleRedeemClick(m.id, r.id, r.points)}
                            className="w-8 h-8 rounded-full text-white text-xs font-semibold flex-shrink-0 hover:opacity-90"
                            style={{ backgroundColor: m.color }}
                            title={`Redeem for ${m.name}`}
                          >
                            {m.initial}
                          </button>
                        ))
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => requestDeleteReward(r.id)}
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-skydark-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors"
                      aria-label="Delete reward"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <RewardModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleSaveReward}
      />

      <FloatingActionButton
        items={[
          {
            label: "Add reward",
            icon: <span>+</span>,
            onClick: requestAddReward,
          },
        ]}
      />

      <PinPrompt
        open={showRedeemPin}
        onClose={() => { setShowRedeemPin(false); setPendingRedeem(null); }}
        onVerify={handleRedeemPinVerify}
        title="Enter PIN to redeem reward"
      />

      <PinPrompt
        open={showManagePin}
        onClose={() => { setShowManagePin(false); setPendingManageAction(null); }}
        onVerify={handleManagePinVerify}
        title={getManagePinTitle()}
      />
    </div>
  );
}

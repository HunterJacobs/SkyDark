import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { format, addDays } from "date-fns";
import PinPrompt from "../components/Common/PinPrompt";
import { useAppContext } from "../contexts/AppContext";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import type { MealSlot } from "../types/meals";
import type { ShoppingListItem } from "../types/shopping";

const STORAGE_MEALS = "skydark_meals";
const STORAGE_SHOPPING_CHECKED = "skydark_shopping_checked";

type TabId = "meals" | "ingredients";

interface GroupedIngredientItem {
  id: string;
  mealName: string;
  quantity: string;
  unit: string;
}

interface GroupedIngredient {
  displayName: string;
  items: GroupedIngredientItem[];
}

function loadMeals(): MealSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_MEALS);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function loadChecked(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_SHOPPING_CHECKED);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

function parseIngredients(raw: unknown): MealSlot["ingredients"] {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((i: { name?: string; quantity?: string; unit?: string }) => ({
      name: i.name ?? "",
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    }));
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseIngredients(parsed);
    } catch {
      return [{ name: raw, quantity: "", unit: "" }];
    }
  }
  return undefined;
}

function skydarkMealsToSlots(rows: { id: string; name: string; meal_date: string; meal_type: string; ingredients?: unknown }[]): MealSlot[] {
  return rows.map((m) => ({
    id: m.id,
    date: m.meal_date,
    mealType: m.meal_type,
    name: m.name,
    ingredients: parseIngredients(m.ingredients),
  }));
}

export default function ShoppingView() {
  const location = useLocation();
  const skydark = useSkydarkDataContext();
  const { isFeatureLocked, verifyPin } = useAppContext();
  const [localMeals, setLocalMeals] = useState<MealSlot[]>(loadMeals());

  const serverMeals = useMemo(() => {
    if (!skydark?.data?.connection || !skydark.data.meals) return [];
    return skydarkMealsToSlots(skydark.data.meals);
  }, [skydark?.data?.connection, skydark?.data?.meals]);

  const meals = skydark?.data?.connection ? serverMeals : localMeals;
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const runAfterPin = (action: () => void) => {
    pendingActionRef.current = action;
    setShowPinPrompt(true);
  };

  const handlePinVerify = (pin: string): boolean => {
    if (!verifyPin(pin)) return false;
    pendingActionRef.current?.();
    pendingActionRef.current = null;
    setShowPinPrompt(false);
    return true;
  };
  const [startDate, setStartDate] = useState(() =>
    format(addDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [endDate, setEndDate] = useState(() =>
    format(addDays(new Date(), 7), "yyyy-MM-dd")
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked);
  const [activeTab, setActiveTab] = useState<TabId>("meals");
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [expandedIngredientKey, setExpandedIngredientKey] = useState<string | null>(null);

  useEffect(() => {
    if (location.pathname === "/shopping" && !skydark?.data?.connection) setLocalMeals(loadMeals());
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem(STORAGE_SHOPPING_CHECKED, JSON.stringify(checked));
  }, [checked]);

  const mealsInRange = useMemo((): MealSlot[] => {
    return meals
      .filter((m) => m.date >= startDate && m.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.mealType.localeCompare(b.mealType));
  }, [meals, startDate, endDate]);

  const shoppingList = useMemo((): ShoppingListItem[] => {
    const list: ShoppingListItem[] = [];
    mealsInRange.forEach((m) => {
      if (!m.ingredients?.length) return;
      m.ingredients.forEach((ing, idx) => {
        if (!ing.name?.trim()) return;
        const id = `${m.id}-${idx}`;
        list.push({
          id,
          name: ing.name.trim(),
          quantity: ing.quantity?.trim() ?? "",
          unit: ing.unit?.trim() ?? "",
          meal_date: m.date,
          meal_name: m.name,
          meal_type: m.mealType,
          checked: checked[id] ?? false,
        });
      });
    });
    return list;
  }, [mealsInRange, checked]);

  const groupedIngredients = useMemo((): GroupedIngredient[] => {
    const map = new Map<string, { displayName: string; items: GroupedIngredientItem[] }>();
    mealsInRange.forEach((m) => {
      if (!m.ingredients?.length) return;
      m.ingredients.forEach((ing, idx) => {
        const nameTrimmed = ing.name?.trim();
        if (!nameTrimmed) return;
        const key = nameTrimmed.toLowerCase();
        const id = `${m.id}-${idx}`;
        const item: GroupedIngredientItem = {
          id,
          mealName: m.name,
          quantity: ing.quantity?.trim() ?? "",
          unit: ing.unit?.trim() ?? "",
        };
        const existing = map.get(key);
        if (existing) {
          existing.items.push(item);
        } else {
          map.set(key, { displayName: nameTrimmed, items: [item] });
        }
      });
    });
    return Array.from(map.values());
  }, [mealsInRange]);

  const toggleItem = (id: string) => {
    if (isFeatureLocked("mealprep")) {
      runAfterPin(() => setChecked((prev) => ({ ...prev, [id]: !prev[id] })));
      return;
    }
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpanded = (mealId: string) => {
    setExpandedMealId((prev) => (prev === mealId ? null : mealId));
  };

  const toggleExpandedIngredient = (key: string) => {
    setExpandedIngredientKey((prev) => (prev === key ? null : key));
  };

  return (
    <>
    <div className="h-full">
      <h2 className="text-lg font-semibold text-skydark-text mb-4">Meal prep list</h2>
      <p className="text-sm text-skydark-text-secondary mb-4">
        Ingredients from your planned meals. Set the date range and add meals in the Meals tab.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-skydark-text-secondary">From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input-skydark"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-skydark-text-secondary">To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input-skydark"
          />
        </label>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 mb-4 w-fit max-w-full">
        <button
          type="button"
          onClick={() => setActiveTab("meals")}
          className={`btn-segment ${
            activeTab === "meals"
              ? "bg-white text-skydark-text shadow-sm"
              : "text-skydark-text-secondary hover:text-skydark-text"
          }`}
        >
          Meals
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ingredients")}
          className={`btn-segment ${
            activeTab === "ingredients"
              ? "bg-white text-skydark-text shadow-sm"
              : "text-skydark-text-secondary hover:text-skydark-text"
          }`}
        >
          Total ingredients
        </button>
      </div>

      {activeTab === "meals" && (
        <>
          {mealsInRange.length === 0 ? (
            <div className="rounded-card bg-white shadow-skydark p-8 text-center text-skydark-text-secondary">
              No meals in this date range. Add meals in the Meals tab.
            </div>
          ) : (
            <ul className="space-y-2">
              {mealsInRange.map((meal) => {
                const isExpanded = expandedMealId === meal.id;
                const hasIngredients = meal.ingredients && meal.ingredients.length > 0;
                return (
                  <li
                    key={meal.id}
                    className="rounded-card bg-white shadow-skydark overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(meal.id)}
                      className="w-full flex items-center justify-between gap-2 p-3 min-h-[44px] text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-medium text-skydark-text truncate">
                        {meal.name}
                      </span>
                      <span className="text-sm text-skydark-text-secondary shrink-0">
                        {format(new Date(meal.date + "T12:00:00"), "EEE, MMM d")} · {meal.mealType}
                      </span>
                      <span
                        className={`shrink-0 text-skydark-text-secondary transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/50 px-3 py-3">
                        {hasIngredients ? (
                          <ul className="space-y-1.5">
                            {meal.ingredients!.map((ing, idx) => (
                              <li
                                key={idx}
                                className="flex items-center gap-2 text-sm text-skydark-text"
                              >
                                <span className="font-medium">{ing.name.trim()}</span>
                                {(ing.quantity?.trim() || ing.unit?.trim()) && (
                                  <span className="text-skydark-text-secondary">
                                    {ing.quantity?.trim()} {ing.unit?.trim()}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-skydark-text-secondary">
                            No ingredients for this meal.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {activeTab === "ingredients" && (
        <>
          {shoppingList.length === 0 ? (
            <div className="rounded-card bg-white shadow-skydark p-8 text-center text-skydark-text-secondary">
              No ingredients in this date range. Add meals with ingredients in the Meals tab.
            </div>
          ) : (
            <div className="space-y-2">
              {groupedIngredients.map((group) => {
                const key = group.displayName.toLowerCase();
                const isExpanded = expandedIngredientKey === key;
                return (
                  <div
                    key={key}
                    className="rounded-card bg-white shadow-skydark overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpandedIngredient(key)}
                      className="w-full flex items-center justify-between gap-2 p-3 min-h-[44px] text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="font-semibold text-skydark-text">
                        {group.displayName}
                      </span>
                      <span className="text-sm text-skydark-text-secondary shrink-0">
                        {group.items.length} {group.items.length === 1 ? "meal" : "meals"}
                      </span>
                      <span
                        className={`shrink-0 text-skydark-text-secondary transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      >
                        ▼
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/50">
                        <ul className="divide-y divide-gray-100">
                          {group.items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50/80"
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItem(item.id);
                                }}
                                className="btn-check"
                                aria-label={checked[item.id] ? "Mark not bought" : "Mark bought"}
                              >
                                <span
                                  className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                                  style={{
                                    borderColor: checked[item.id] ? "#9EE5CC" : "#D1D5DB",
                                    backgroundColor: checked[item.id] ? "#9EE5CC" : "white",
                                  }}
                                >
                                  {checked[item.id] && (
                                    <span className="text-white text-sm font-bold">✓</span>
                                  )}
                                </span>
                              </button>
                              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                <span
                                  className={
                                    checked[item.id]
                                      ? "line-through text-skydark-text-secondary text-sm"
                                      : "text-skydark-text text-sm"
                                  }
                                >
                                  {item.mealName}
                                </span>
                                {(item.quantity || item.unit) && (
                                  <span className="text-skydark-text-secondary text-sm">
                                    — {item.quantity} {item.unit}
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
    <PinPrompt
      open={showPinPrompt}
      onClose={() => { setShowPinPrompt(false); pendingActionRef.current = null; }}
      onVerify={handlePinVerify}
      title="Enter PIN"
    />
  </>
  );
}

import { useState, useEffect, useMemo } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { DndProvider } from "react-dnd";
import { TouchBackend } from "react-dnd-touch-backend";
import MealModal from "../components/Meals/MealModal";
import DraggableMealCard from "../components/Meals/DraggableMealCard";
import DropTargetMealCell from "../components/Meals/DropTargetMealCell";
import PinPrompt from "../components/Common/PinPrompt";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import { usePinGate } from "../hooks/usePinGate";
import { serviceAddMealRecipe, serviceAddMeal, serviceUpdateMeal, serviceDeleteMeal, serviceDeleteMealRecipe } from "../lib/skyDarkApi";
import type { MealSlot, MealRecipe, MealIngredient } from "../types/meals";
import type { SaveMealPayload } from "../components/Meals/MealModal";
import type { SkydarkMeal, SkydarkMealRecipe } from "../lib/skyDarkApi";

const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const DAYS = 7;
const STORAGE_MEALS = "skydark_meals";
const STORAGE_RECIPES = "skydark_recipes";

function loadMeals(): MealSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_MEALS);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function loadRecipes(): MealRecipe[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECIPES);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function parseIngredients(raw: SkydarkMeal["ingredients"]): MealIngredient[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((i) => ({
      name: i.name ?? "",
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    }));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((i: { name?: string; quantity?: string; unit?: string }) => ({
        name: i.name ?? "",
        quantity: i.quantity ?? "",
        unit: i.unit ?? "",
      }));
    }
  } catch {
    return [{ name: raw, quantity: "", unit: "" }];
  }
  return undefined;
}

function skydarkMealsToSlots(rows: SkydarkMeal[]): MealSlot[] {
  return rows.map((m) => ({
    id: m.id,
    date: m.meal_date,
    mealType: m.meal_type,
    name: m.name,
    recipeId: m.meal_recipe_id ?? undefined,
    ingredients: parseIngredients(m.ingredients),
  }));
}

function recipesFromSkydark(rows: SkydarkMealRecipe[]): MealRecipe[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    ingredients: (r.ingredients ?? []).map((i) => ({
      name: i.name ?? "",
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    })),
  }));
}

export default function MealsView() {
  const skydark = useSkydarkDataContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const [weekStart, setWeekStart] = useState(() => startOfDay(new Date()));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void skydark?.refetchMeals(format(weekStart, "yyyy-MM-dd"), format(addDays(weekStart, 6), "yyyy-MM-dd")); }, [weekStart, skydark?.refetchMeals]);
  const [localMeals, setLocalMeals] = useState<MealSlot[]>(loadMeals);
  const [localRecipes, setLocalRecipes] = useState<MealRecipe[]>(loadRecipes);

  const serverMeals = useMemo(() => {
    if (!skydark?.data?.connection || !skydark.data.meals) return [];
    return skydarkMealsToSlots(skydark.data.meals);
  }, [skydark?.data?.connection, skydark?.data?.meals]);

  const serverRecipes = useMemo(() => {
    if (!skydark?.data?.connection || !skydark.data.recipes) return [];
    return recipesFromSkydark(skydark.data.recipes);
  }, [skydark?.data?.connection, skydark?.data?.recipes]);

  const meals = skydark?.data?.connection ? serverMeals : localMeals;
  const recipes = skydark?.data?.connection ? serverRecipes : localRecipes;

  useEffect(() => {
    if (!skydark?.data?.connection) try { localStorage.setItem(STORAGE_MEALS, JSON.stringify(localMeals)); } catch { /* ignore */ }
  }, [skydark?.data?.connection, localMeals]);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_RECIPES, JSON.stringify(localRecipes)); } catch { /* ignore */ }
  }, [localRecipes]);
  const [modalOpen, setModalOpen] = useState(false);
  const [slotForModal, setSlotForModal] = useState<{ date: string; mealType: string } | null>(null);
  const [editSlot, setEditSlot] = useState<MealSlot | null>(null);
  const [viewRecipe, setViewRecipe] = useState<MealRecipe | null>(null);

  const openAddModal = (date: string, mealType: string) => {
    runIfUnlocked("meals", () => {
      setSlotForModal({ date, mealType });
      setEditSlot(null);
      setModalOpen(true);
    });
  };

  const openEditModal = (slot: MealSlot) => {
    runIfUnlocked("meals", () => {
      setEditSlot(slot);
      setSlotForModal(null);
      setModalOpen(true);
    });
  };

  const handleSaveMeal = (data: SaveMealPayload) => {
    runIfUnlocked("meals", () => doSaveMeal(data));
  };

  const doSaveMeal = async (data: SaveMealPayload) => {
    setError(null);
    const conn = skydark?.data?.connection;
    const ingredients = data.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    }));

    if (conn) {
      try {
        let recipeId = editSlot?.recipeId;
        if (data.saveToLibrary && !data.slotId) {
          await serviceAddMealRecipe(conn, { name: data.name, ingredients });
        }
        if (data.slotId) {
          await serviceUpdateMeal(conn, {
            meal_id: data.slotId,
            name: data.name,
            ingredients,
            meal_recipe_id: data.updateLibrary ? recipeId : undefined,
          });
        } else if (slotForModal) {
          await serviceAddMeal(conn, {
            name: data.name,
            meal_date: slotForModal.date,
            meal_type: slotForModal.mealType,
            ingredients,
            meal_recipe_id: recipeId,
          });
        }
        await skydark?.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the meal. Please retry.");
        return;
      }
      setModalOpen(false);
      setSlotForModal(null);
      setEditSlot(null);
      return;
    }

    if (data.slotId) {
      setLocalMeals((prev) =>
        prev.map((m) =>
          m.id === data.slotId
            ? { ...m, name: data.name, ingredients: data.ingredients.length ? data.ingredients : undefined, imageUrl: data.imageUrl, instructions: data.instructions }
            : m
        )
      );
      if (data.updateLibrary && editSlot?.recipeId) {
        setLocalRecipes((prev) =>
          prev.map((r) =>
            r.id === editSlot.recipeId ? { ...r, name: data.name, ingredients: data.ingredients, imageUrl: data.imageUrl, instructions: data.instructions } : r
          )
        );
      }
    } else if (slotForModal) {
      const recipeId = data.saveToLibrary ? `recipe-${Date.now()}` : undefined;
      const id = `${slotForModal.date}-${slotForModal.mealType}-${Date.now()}`;
      setLocalMeals((prev) => [
        ...prev,
        { id, date: slotForModal.date, mealType: slotForModal.mealType, name: data.name, ingredients: data.ingredients.length ? data.ingredients : undefined, imageUrl: data.imageUrl, instructions: data.instructions, recipeId },
      ]);
      if (data.saveToLibrary) {
        setLocalRecipes((prev) => [...prev, { id: recipeId!, name: data.name, ingredients: data.ingredients, imageUrl: data.imageUrl, instructions: data.instructions }]);
      }
    }
    setModalOpen(false);
    setSlotForModal(null);
    setEditSlot(null);
  };

  const handleAssignFromLibrary = (recipe: MealRecipe) => {
    if (!slotForModal) return;
    runIfUnlocked("meals", () => doAssignFromLibrary(recipe));
  };

  const doAssignFromLibrary = async (recipe: MealRecipe) => {
    if (!slotForModal) return;
    setError(null);
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceAddMeal(conn, {
          name: recipe.name,
          meal_date: slotForModal.date,
          meal_type: slotForModal.mealType,
          ingredients: recipe.ingredients,
          meal_recipe_id: recipe.id,
        });
        await skydark?.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the meal. Please retry.");
        return;
      }
    } else {
      const id = `${slotForModal.date}-${slotForModal.mealType}-${Date.now()}`;
      setLocalMeals((prev) => [...prev, { id, date: slotForModal.date, mealType: slotForModal.mealType, name: recipe.name, ingredients: recipe.ingredients, imageUrl: recipe.imageUrl, instructions: recipe.instructions, recipeId: recipe.id }]);
    }
    setModalOpen(false);
    setSlotForModal(null);
  };

  const handleRemoveMeal = (slotId: string) => {
    runIfUnlocked("meals", () => doRemoveMeal(slotId));
  };

  const doRemoveMeal = async (slotId: string) => {
    setError(null);
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceDeleteMeal(conn, slotId);
        await skydark?.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the meal. Please retry.");
        return;
      }
    } else {
      setLocalMeals((prev) => prev.filter((m) => m.id !== slotId));
    }
    setModalOpen(false);
    setSlotForModal(null);
    setEditSlot(null);
  };

  const handleRemoveFromLibrary = (recipeId: string) => {
    runIfUnlocked("meals", () => doRemoveFromLibrary(recipeId));
  };

  const doRemoveFromLibrary = async (recipeId: string) => {
    setError(null);
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceDeleteMealRecipe(conn, recipeId);
        await skydark?.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the meal. Please retry.");
        return;
      }
    } else {
      setLocalRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setLocalMeals((prev) =>
        prev.map((m) => (m.recipeId === recipeId ? { ...m, recipeId: undefined } : m))
      );
    }
    setModalOpen(false);
    setEditSlot(null);
    setViewRecipe(null);
  };

  const handleUpdateRecipe = (recipeId: string, data: SaveMealPayload) => {
    runIfUnlocked("meals", () => doUpdateRecipe(recipeId, data));
  };

  const doUpdateRecipe = (recipeId: string, data: SaveMealPayload) => {
    if (skydark?.data.connection) { setError("Editing saved library recipes is not supported by the backend yet. Create a new recipe instead."); return; }
    setLocalRecipes((prev) =>
      prev.map((r) =>
        r.id === recipeId ? { ...r, name: data.name, ingredients: data.ingredients, imageUrl: data.imageUrl, instructions: data.instructions } : r
      )
    );
    setLocalMeals((prev) =>
      prev.map((m) =>
        m.recipeId === recipeId ? { ...m, name: data.name, ingredients: data.ingredients.length ? data.ingredients : undefined, imageUrl: data.imageUrl, instructions: data.instructions } : m
      )
    );
    setViewRecipe(null);
  };

  const handleDropFromPopular = (recipe: MealRecipe, date: string, mealType: string) => {
    runIfUnlocked("meals", () => doDropFromPopular(recipe, date, mealType));
  };

  const doDropFromPopular = async (recipe: MealRecipe, date: string, mealType: string) => {
    setError(null);
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceAddMeal(conn, {
          name: recipe.name,
          meal_date: date,
          meal_type: mealType,
          ingredients: recipe.ingredients,
          meal_recipe_id: recipe.id,
        });
        await skydark?.refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the meal. Please retry.");
        return;
      }
      return;
    }
    const id = `${date}-${mealType}-${Date.now()}`;
    setLocalMeals((prev) => [...prev, { id, date, mealType, name: recipe.name, ingredients: recipe.ingredients, imageUrl: recipe.imageUrl, instructions: recipe.instructions, recipeId: recipe.id }]);
  };

  const weekDates = Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i));

  const popularMeals = useMemo((): MealRecipe[] => {
    const useCountByRecipeId: Record<string, number> = {};
    recipes.forEach((r) => {
      useCountByRecipeId[r.id] = 0;
    });
    meals.forEach((m) => {
      if (m.recipeId && useCountByRecipeId[m.recipeId] !== undefined) {
        useCountByRecipeId[m.recipeId]++;
      } else if (m.name) {
        const r = recipes.find((rec) => rec.name === m.name);
        if (r) useCountByRecipeId[r.id] = (useCountByRecipeId[r.id] ?? 0) + 1;
      }
    });
    return [...recipes]
      .sort((a, b) => (useCountByRecipeId[b.id] ?? 0) - (useCountByRecipeId[a.id] ?? 0))
      .slice(0, 14);
  }, [meals, recipes]);

  return (
    <DndProvider backend={TouchBackend} options={{ enableMouseEvents: true, delayTouchStart: 250, touchSlop: 12 }}>
    <div className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-semibold">Meals · {format(weekStart, "MMM d")}</h2>
        <div className="flex gap-1"><button className="btn-icon" aria-label="Previous meal week" onClick={() => setWeekStart(d => addDays(d,-7))}>‹</button><button className="btn-ghost" onClick={() => setWeekStart(startOfDay(new Date()))}>This week</button><button className="btn-icon" aria-label="Next meal week" onClick={() => setWeekStart(d => addDays(d,7))}>›</button></div>
      </div>
      {error && <p role="alert" className="p-3 mb-3 rounded-xl bg-red-50 text-red-700">{error}</p>}
      <div className="md:hidden space-y-4">
        {weekDates.map(day => {
          const date = format(day, "yyyy-MM-dd");
          return <section key={date} className="bg-white rounded-xl border border-gray-200 p-3">
            <h3 className="font-semibold mb-2">{format(day, "EEEE, MMM d")}</h3>
            {MEAL_TYPES.map(mealType => {
              const slot = meals.find(m => m.date === date && m.mealType === mealType);
              return <button key={mealType} className="w-full min-h-[52px] py-2 text-left border-t border-gray-100 flex gap-3 items-center" onClick={() => slot ? openEditModal(slot) : openAddModal(date, mealType)}>
                <span className="w-20 shrink-0 text-sm text-skydark-text-secondary">{mealType}</span>
                <span className="min-w-0 break-words font-medium">{slot?.name || "+ Add meal"}</span>
              </button>;
            })}
          </section>;
        })}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-card shadow-skydark overflow-hidden min-w-[600px]">
          <thead>
            <tr className="bg-skydark-bg border-b border-gray-200">
              <th className="text-left p-3 text-skydark-text-secondary font-medium w-24">Meal</th>
              {weekDates.map((d) => (
                <th
                  key={d.toISOString()}
                  className="p-3 text-center text-sm font-semibold text-skydark-text min-w-[120px]"
                >
                  {format(d, "EEE")}
                  <br />
                  <span className="text-skydark-text-secondary font-normal">
                    {format(d, "MMM d")}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_TYPES.map((mealType) => (
              <tr key={mealType} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="p-3 text-skydark-text font-medium">{mealType}</td>
                {weekDates.map((d) => {
                  const dateStr = format(d, "yyyy-MM-dd");
                  const slot = meals.find(
                    (m) => m.date === dateStr && m.mealType === mealType
                  );
                  return (
                    <td key={dateStr + mealType} className="p-2 align-top">
                      <DropTargetMealCell
                        date={dateStr}
                        mealType={mealType}
                        onDrop={handleDropFromPopular}
                      >
                        <button
                          type="button"
                          className="w-full min-h-[60px] rounded-card border-2 border-dashed border-gray-200 hover:border-skydark-accent hover:bg-skydark-accent-bg text-sm text-skydark-text-secondary hover:text-skydark-accent transition-colors text-left px-2 py-2 flex items-center gap-2"
                          onClick={() => (slot ? openEditModal(slot) : openAddModal(dateStr, mealType))}
                        >
                          {slot ? (
                            <>
                              {slot.imageUrl && (
                                <img
                                  src={slot.imageUrl}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover shrink-0"
                                />
                              )}
                              <span className="text-skydark-text font-medium truncate">
                                {slot.name}
                              </span>
                            </>
                          ) : (
                            "+ Add"
                          )}
                        </button>
                      </DropTargetMealCell>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-skydark-text-secondary">
        Add meals to plan your week. Click a cell to add or edit. Save meals to the library to
        reuse. Use the Meal prep tab to generate a list from your planned meals.
      </p>

      <h3 className="text-base font-semibold text-skydark-text mt-6 mb-2">
        Most popular meals
      </h3>
      <p className="text-sm text-skydark-text-secondary mb-2">
        On a touchscreen, tap a meal slot and choose from your library. On the weekly grid, hold a meal briefly to drag it into a slot.
      </p>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {popularMeals.map((recipe) => (
            <DraggableMealCard
              key={recipe.id}
              recipe={recipe}
              onRecipeClick={() => setViewRecipe(recipe)}
            />
          ))}
        </div>
      </div>

      <MealModal
        open={modalOpen || !!viewRecipe}
        onClose={() => {
          setModalOpen(false);
          setSlotForModal(null);
          setEditSlot(null);
          setViewRecipe(null);
        }}
        slotForModal={slotForModal}
        editSlot={editSlot}
        viewRecipe={viewRecipe}
        recipes={recipes}
        error={error}
        onSave={handleSaveMeal}
        onAssignFromLibrary={handleAssignFromLibrary}
        onRemove={handleRemoveMeal}
        onRemoveFromLibrary={handleRemoveFromLibrary}
        onUpdateRecipe={handleUpdateRecipe}
      />
    </div>
    <PinPrompt {...pinPromptProps} />
    </DndProvider>
  );
}

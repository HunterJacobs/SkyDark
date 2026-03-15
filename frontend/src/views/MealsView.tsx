import { useState, useEffect, useMemo } from "react";
import { format, addDays, startOfDay } from "date-fns";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import MealModal from "../components/Meals/MealModal";
import DraggableMealCard from "../components/Meals/DraggableMealCard";
import DropTargetMealCell from "../components/Meals/DropTargetMealCell";
import PinPrompt from "../components/Common/PinPrompt";
import { useSkydarkDataContext } from "../contexts/SkydarkDataContext";
import { usePinGate } from "../hooks/usePinGate";
import { fetchAddMealRecipe, serviceAddMeal, serviceUpdateMeal, serviceDeleteMeal } from "../lib/skyDarkApi";
import type { MealSlot, MealRecipe } from "../types/meals";
import type { SaveMealPayload } from "../components/Meals/MealModal";

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

function parseMealIngredients(
  raw: string | { name: string; quantity?: string; unit?: string }[] | null | undefined
): { name: string; quantity: string; unit: string }[] | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    if (raw.length === 0) return undefined;
    return raw.map((i) => ({
      name: i.name ?? "",
      quantity: (i.quantity as string) ?? "",
      unit: (i.unit as string) ?? "",
    }));
  }
  try {
    const parsed = JSON.parse(raw as string);
    if (!Array.isArray(parsed) || parsed.length === 0) return undefined;
    return parsed.map((i: { name?: string; quantity?: string; unit?: string }) => ({
      name: i.name ?? "",
      quantity: (i.quantity as string) ?? "",
      unit: (i.unit as string) ?? "",
    }));
  } catch {
    return undefined;
  }
}

function skydarkMealsToSlots(rows: { id: string; name: string; meal_date: string; meal_type: string; meal_recipe_id?: string | null; ingredients?: string | { name: string; quantity?: string; unit?: string }[] | null }[]): MealSlot[] {
  return rows.map((m) => ({
    id: m.id,
    date: m.meal_date,
    mealType: m.meal_type,
    name: m.name,
    recipeId: m.meal_recipe_id ?? undefined,
    ingredients: parseMealIngredients(m.ingredients),
  }));
}

function serverRecipesToMealRecipes(
  list: { id: string; name: string; ingredients?: { name: string; quantity?: string; unit?: string }[] }[]
): MealRecipe[] {
  return list.map((r) => ({
    id: r.id,
    name: r.name,
    ingredients: (r.ingredients ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity ?? "",
      unit: i.unit ?? "",
    })),
  }));
}

export default function MealsView() {
  const skydark = useSkydarkDataContext();
  const { runIfUnlocked, pinPromptProps } = usePinGate();
  const weekStart = startOfDay(new Date());
  const [localMeals, setLocalMeals] = useState<MealSlot[]>(loadMeals);
  const [localRecipes, setLocalRecipes] = useState<MealRecipe[]>(loadRecipes);

  const serverMeals = useMemo(() => {
    if (!skydark?.data?.connection || !skydark.data.meals) return [];
    return skydarkMealsToSlots(skydark.data.meals);
  }, [skydark?.data?.connection, skydark?.data?.meals]);

  const serverRecipes = useMemo(
    () => serverRecipesToMealRecipes(skydark?.data?.mealRecipes ?? []),
    [skydark?.data?.mealRecipes]
  );

  const meals = skydark?.data?.connection ? serverMeals : localMeals;
  const recipes = skydark?.data?.connection ? serverRecipes : localRecipes;

  useEffect(() => {
    if (!skydark?.data?.connection) try { localStorage.setItem(STORAGE_MEALS, JSON.stringify(localMeals)); } catch { /* ignore */ }
  }, [skydark?.data?.connection, localMeals]);
  useEffect(() => {
    if (!skydark?.data?.connection) try { localStorage.setItem(STORAGE_RECIPES, JSON.stringify(localRecipes)); } catch { /* ignore */ }
  }, [skydark?.data?.connection, localRecipes]);
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
    const conn = skydark?.data?.connection;
    if (data.slotId) {
      // Editing existing meal
      if (conn) {
        try {
          const updatePayload: Parameters<typeof serviceUpdateMeal>[1] = {
            meal_id: data.slotId,
            name: data.name,
            meal_recipe_id: editSlot?.recipeId,
          };
          if (!editSlot?.recipeId && data.ingredients.length > 0) {
            updatePayload.ingredients = JSON.stringify(
              data.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
            );
          }
          await serviceUpdateMeal(conn, updatePayload);
          await skydark?.refetchMeals();
        } catch (err) {
          console.error("[SkyDark] Failed to update meal:", err);
        }
      } else {
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
      }
    } else if (slotForModal) {
      // Adding new meal
      if (conn) {
        try {
          let meal_recipe_id: string | undefined;
          if (data.saveToLibrary) {
            const { recipe_id } = await fetchAddMealRecipe(conn, {
              name: data.name,
              ingredients: data.ingredients.map((i) => ({ name: i.name, quantity: i.quantity ?? "", unit: i.unit ?? "" })),
            });
            meal_recipe_id = recipe_id;
            await skydark?.refetchRecipes();
          }
          const addPayload: Parameters<typeof serviceAddMeal>[1] = {
            name: data.name,
            meal_date: slotForModal.date,
            meal_type: slotForModal.mealType,
          };
          if (meal_recipe_id) addPayload.meal_recipe_id = meal_recipe_id;
          else if (data.ingredients.length > 0)
            addPayload.ingredients = JSON.stringify(
              data.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit }))
            );
          await serviceAddMeal(conn, addPayload);
          await skydark?.refetchMeals();
        } catch (err) {
          console.error("[SkyDark] Failed to add meal:", err);
        }
      } else {
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
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceAddMeal(conn, {
          name: recipe.name,
          meal_date: slotForModal.date,
          meal_type: slotForModal.mealType,
          meal_recipe_id: recipe.id,
        });
        await skydark?.refetchMeals();
      } catch (err) {
        console.error("[SkyDark] Failed to assign meal from library:", err);
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
    const conn = skydark?.data?.connection;
    if (conn) {
      try {
        await serviceDeleteMeal(conn, { meal_id: slotId });
        await skydark?.refetchMeals();
      } catch (err) {
        console.error("[SkyDark] Failed to delete meal:", err);
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

  const doRemoveFromLibrary = (recipeId: string) => {
    setLocalRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    if (!skydark?.data?.connection) {
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
    setLocalRecipes((prev) =>
      prev.map((r) =>
        r.id === recipeId ? { ...r, name: data.name, ingredients: data.ingredients, imageUrl: data.imageUrl, instructions: data.instructions } : r
      )
    );
    if (!skydark?.data?.connection) {
      setLocalMeals((prev) =>
        prev.map((m) =>
          m.recipeId === recipeId ? { ...m, name: data.name, ingredients: data.ingredients.length ? data.ingredients : undefined, imageUrl: data.imageUrl, instructions: data.instructions } : m
        )
      );
    }
    setViewRecipe(null);
  };

  const handleDropFromPopular = (recipe: MealRecipe, date: string, mealType: string) => {
    runIfUnlocked("meals", () => doDropFromPopular(recipe, date, mealType));
  };

  const doDropFromPopular = async (recipe: MealRecipe, date: string, mealType: string) => {
    const conn = skydark?.data?.connection;
    const existingSlot = meals.find((m) => m.date === date && m.mealType === mealType);
    if (conn) {
      try {
        if (existingSlot) {
          await serviceUpdateMeal(conn, {
            meal_id: existingSlot.id,
            name: recipe.name,
            meal_recipe_id: recipe.id,
          });
        } else {
          await serviceAddMeal(conn, {
            name: recipe.name,
            meal_date: date,
            meal_type: mealType,
            meal_recipe_id: recipe.id,
          });
        }
        await skydark?.refetchMeals();
      } catch (err) {
        console.error("[SkyDark] Failed to add meal:", err);
      }
    } else {
      if (existingSlot) {
        setLocalMeals((prev) =>
          prev.map((m) =>
            m.id === existingSlot.id
              ? {
                  ...m,
                  name: recipe.name,
                  ingredients: recipe.ingredients,
                  imageUrl: recipe.imageUrl,
                  instructions: recipe.instructions,
                  recipeId: recipe.id,
                }
              : m
          )
        );
      } else {
        const id = `${date}-${mealType}-${Date.now()}`;
        setLocalMeals((prev) => [
          ...prev,
          {
            id,
            date,
            mealType,
            name: recipe.name,
            ingredients: recipe.ingredients,
            imageUrl: recipe.imageUrl,
            instructions: recipe.instructions,
            recipeId: recipe.id,
          },
        ]);
      }
    }
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
    <DndProvider backend={HTML5Backend}>
    <div className="h-full">
      <h2 className="text-lg font-semibold text-skydark-text mb-4">Meals</h2>

      <div className="overflow-x-auto">
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
        Drag a meal to a day slot above to add it to your plan.
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

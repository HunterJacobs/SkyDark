import { useState, useEffect, useRef } from "react";
import Modal from "../Common/Modal";
import CloseIcon from "../Common/CloseIcon";
import type { MealIngredient, MealRecipe, MealSlot } from "../../types/meals";

export type SaveMealPayload = {
  name: string;
  ingredients: MealIngredient[];
  saveToLibrary: boolean;
  updateLibrary?: boolean;
  imageUrl?: string;
  instructions?: string;
  slotId?: string;
};

interface MealModalProps {
  open: boolean;
  onClose: () => void;
  /** When adding to a slot. */
  slotForModal: { date: string; mealType: string } | null;
  /** When editing an existing slot. */
  editSlot: MealSlot | null;
  /** When viewing a recipe from library (e.g. click on popular meal). */
  viewRecipe: MealRecipe | null;
  recipes: MealRecipe[];
  onSave: (data: SaveMealPayload) => void;
  onAssignFromLibrary: (recipe: MealRecipe) => void;
  /** Remove meal from the day (view mode). */
  onRemove?: (slotId: string) => void;
  /** Permanently remove recipe from library (edit mode). */
  onRemoveFromLibrary?: (recipeId: string) => void;
  /** Update a library recipe (when editing from view recipe). */
  onUpdateRecipe?: (recipeId: string, data: SaveMealPayload) => void;
}

const emptyIngredient: MealIngredient = { name: "", quantity: "", unit: "" };

function filterRecipes(recipes: MealRecipe[], query: string): MealRecipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter((r) => r.name.toLowerCase().includes(q));
}

export default function MealModal({
  open,
  onClose,
  slotForModal,
  editSlot,
  viewRecipe,
  recipes,
  onSave,
  onAssignFromLibrary,
  onRemove,
  onRemoveFromLibrary,
  onUpdateRecipe,
}: MealModalProps) {
  const isEdit = !!editSlot;
  const isViewRecipe = !!viewRecipe && !editSlot && !slotForModal;
  const [viewMode, setViewMode] = useState(true);
  const [viewRecipeViewMode, setViewRecipeViewMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState<MealIngredient[]>([{ ...emptyIngredient }]);
  const [instructions, setInstructions] = useState("");
  const [saveToLibrary, setSaveToLibrary] = useState(false);
  const [updateLibrary, setUpdateLibrary] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredRecipes = filterRecipes(recipes, searchQuery);
  const hasMatches = filteredRecipes.length > 0;
  const matchedSearch = searchQuery.trim().length > 0;

  useEffect(() => {
    if (open) {
      setViewMode(true);
      setViewRecipeViewMode(true);
      setSearchQuery("");
      setShowAddForm(false);
      if (editSlot) {
        setName(editSlot.name);
        setIngredients(
          editSlot.ingredients?.length
            ? editSlot.ingredients.map((i) => ({ ...i }))
            : [{ ...emptyIngredient }]
        );
        setInstructions(editSlot.instructions ?? "");
        setImageUrl(editSlot.imageUrl);
        setSaveToLibrary(false);
        setUpdateLibrary(!!editSlot.recipeId);
      } else if (viewRecipe) {
        setName(viewRecipe.name);
        setIngredients(
          viewRecipe.ingredients?.length
            ? viewRecipe.ingredients.map((i) => ({ ...i }))
            : [{ ...emptyIngredient }]
        );
        setInstructions(viewRecipe.instructions ?? "");
        setImageUrl(viewRecipe.imageUrl);
      } else {
        setName("");
        setIngredients([{ ...emptyIngredient }]);
        setInstructions("");
        setImageUrl(undefined);
        setSaveToLibrary(false);
        setUpdateLibrary(false);
      }
    }
  }, [open, editSlot, viewRecipe]);

  const addIngredient = () => {
    setIngredients((prev) => [...prev, { ...emptyIngredient }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof MealIngredient, value: string) => {
    setIngredients((prev) =>
      prev.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing))
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemovePhoto = () => {
    setImageUrl(undefined);
    fileInputRef.current?.value && (fileInputRef.current.value = "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const filtered = ingredients.filter((ing) => ing.name.trim());
    const payload: SaveMealPayload = {
      name: trimmedName,
      ingredients: filtered,
      saveToLibrary,
      updateLibrary: isEdit && updateLibrary,
      imageUrl,
      instructions: instructions.trim() || undefined,
      slotId: editSlot?.id,
    };
    if (isViewRecipe && viewRecipe && onUpdateRecipe) {
      onUpdateRecipe(viewRecipe.id, payload);
      onClose();
      return;
    }
    onSave(payload);
    onClose();
  };

  const handleSelectRecipe = (recipe: MealRecipe) => {
    onAssignFromLibrary(recipe);
    onClose();
  };

  const title = isViewRecipe
    ? viewRecipeViewMode
      ? viewRecipe?.name ?? "Meal"
      : "Edit meal"
    : isEdit
      ? viewMode
        ? editSlot?.name ?? "Meal"
        : "Edit meal"
      : "Add meal";
  const showSearchAndResults = !isEdit && !isViewRecipe && slotForModal && !showAddForm;
  const showView = isEdit && viewMode;
  const showViewRecipe = isViewRecipe && viewRecipe && viewRecipeViewMode;
  const showForm = (isEdit && !viewMode) || showAddForm || (isViewRecipe && !viewRecipeViewMode);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      variant="slideRight"
      rightAction={
        (showView && editSlot) || (showViewRecipe && viewRecipe) ? (
          <button
            type="button"
            onClick={() => {
              if (showView && editSlot) setViewMode(false);
              if (showViewRecipe && viewRecipe) {
                setViewRecipeViewMode(false);
                setName(viewRecipe.name);
                setIngredients(
                  viewRecipe.ingredients?.length
                    ? viewRecipe.ingredients.map((i) => ({ ...i }))
                    : [{ ...emptyIngredient }]
                );
                setInstructions(viewRecipe.instructions ?? "");
                setImageUrl(viewRecipe.imageUrl);
              }
            }}
            className="p-2 rounded-lg hover:bg-gray-100 text-skydark-text-secondary font-medium text-sm"
            aria-label="Edit meal"
          >
            Edit
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col h-full">
        {showViewRecipe && viewRecipe && (
          <div className="flex flex-col h-full min-h-0">
            {viewRecipe.imageUrl && (
              <div className="mb-3 shrink-0">
                <img
                  src={viewRecipe.imageUrl}
                  alt=""
                  className="w-full h-32 object-cover rounded-xl"
                />
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="mb-3">
                <p className="text-xs font-medium text-skydark-text-secondary uppercase tracking-wide mb-1.5">
                  Ingredients
                </p>
                <ul className="space-y-0.5 text-sm text-skydark-text">
                  {viewRecipe.ingredients?.length ? (
                    viewRecipe.ingredients.map((ing, i) => (
                      <li key={i} className="flex gap-2">
                        {(ing.quantity || ing.unit) && (
                          <span className="text-skydark-text-secondary shrink-0">
                            {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                          </span>
                        )}
                        <span>{ing.name}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-skydark-text-secondary">No ingredients</li>
                  )}
                </ul>
              </div>
              {viewRecipe.instructions?.trim() && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-skydark-text-secondary uppercase tracking-wide mb-1.5">
                    Instructions
                  </p>
                  <p className="text-sm text-skydark-text whitespace-pre-wrap">
                    {viewRecipe.instructions}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {showView && editSlot && (
          <div className="flex flex-col h-full min-h-0">
            {editSlot.imageUrl && (
              <div className="mb-3 shrink-0">
                <img
                  src={editSlot.imageUrl}
                  alt=""
                  className="w-full h-32 object-cover rounded-xl"
                />
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-auto">
              <div className="mb-3">
                <p className="text-xs font-medium text-skydark-text-secondary uppercase tracking-wide mb-1.5">
                  Ingredients
                </p>
                <ul className="space-y-0.5 text-sm text-skydark-text">
                  {editSlot.ingredients?.length ? (
                    editSlot.ingredients.map((ing, i) => (
                      <li key={i} className="flex gap-2">
                        {(ing.quantity || ing.unit) && (
                          <span className="text-skydark-text-secondary shrink-0">
                            {[ing.quantity, ing.unit].filter(Boolean).join(" ")}
                          </span>
                        )}
                        <span>{ing.name}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-skydark-text-secondary">No ingredients</li>
                  )}
                </ul>
              </div>
              {editSlot.instructions?.trim() && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-skydark-text-secondary uppercase tracking-wide mb-1.5">
                    Instructions
                  </p>
                  <p className="text-sm text-skydark-text whitespace-pre-wrap">
                    {editSlot.instructions}
                  </p>
                </div>
              )}
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={() => {
                  onRemove(editSlot.id);
                  onClose();
                }}
                className="mt-3 w-full py-2.5 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors shrink-0"
              >
                Remove from this day
              </button>
            )}
          </div>
        )}

        {showSearchAndResults && (
          <>
            <div className="mb-3">
              <label className="block text-sm font-medium text-skydark-text mb-1">
                Search meals
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-skydark"
                placeholder="Search library..."
                autoFocus
              />
            </div>
            <div className="flex-1 min-h-0 overflow-auto mb-3" style={{ maxHeight: "70vh" }}>
              <div className="grid grid-cols-2 gap-2">
                {filteredRecipes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectRecipe(r)}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:border-skydark-accent hover:bg-skydark-accent-bg text-left transition-colors"
                  >
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 shrink-0 flex items-center justify-center text-gray-400 text-base">
                        🍽️
                      </div>
                    )}
                    <span className="font-medium text-skydark-text text-sm truncate flex-1 min-w-0">
                      {r.name}
                    </span>
                  </button>
                ))}
              </div>
              {matchedSearch && !hasMatches && (
                <p className="text-sm text-skydark-text-secondary py-2">No matches</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 hover:border-skydark-accent hover:bg-skydark-accent-bg text-skydark-accent font-medium transition-colors"
            >
              + Add Meal
            </button>
          </>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 flex-1 min-h-0 overflow-auto">
            <div>
              <label className="block text-sm font-medium text-skydark-text mb-1">
                Meal name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-skydark"
                placeholder="e.g. Spaghetti Bolognese"
                required
                autoFocus={showAddForm}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-skydark-text mb-1">Photo</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {imageUrl ? (
                <div className="flex items-start gap-2">
                  <img
                    src={imageUrl}
                    alt="Meal"
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary text-sm"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-skydark-accent hover:bg-skydark-accent-bg text-skydark-text-secondary text-sm"
                >
                  + Add photo
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-skydark-text">Ingredients</label>
                <button
                  type="button"
                  onClick={addIngredient}
                  className="text-sm font-medium text-skydark-accent hover:underline"
                >
                  + Add ingredient
                </button>
              </div>
              <div className="space-y-2 max-h-48 overflow-auto">
                {ingredients.map((ing, idx) => (
                  <div key={idx} className="flex gap-2 items-center flex-wrap">
                    <input
                      type="text"
                      value={ing.name}
                      onChange={(e) => updateIngredient(idx, "name", e.target.value)}
                      className="flex-1 min-w-[100px] input-skydark py-2"
                      placeholder="Item"
                    />
                    <input
                      type="text"
                      value={ing.quantity}
                      onChange={(e) => updateIngredient(idx, "quantity", e.target.value)}
                      className="w-20 input-skydark py-2"
                      placeholder="Qty"
                    />
                    <input
                      type="text"
                      value={ing.unit}
                      onChange={(e) => updateIngredient(idx, "unit", e.target.value)}
                      className="w-20 input-skydark py-2"
                      placeholder="Unit"
                    />
                    <button
                      type="button"
                      onClick={() => removeIngredient(idx)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      aria-label="Remove ingredient"
                    >
                      <CloseIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-skydark-text mb-1">
                Instructions
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="input-skydark min-h-[80px] resize-y"
                placeholder="Steps or notes..."
                rows={3}
              />
            </div>

            {isEdit && editSlot?.recipeId ? (
              <>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={updateLibrary}
                    onChange={(e) => setUpdateLibrary(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-skydark-text">
                    Update meal ingredients in library
                  </span>
                </label>
                {onRemoveFromLibrary && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveFromLibrary(editSlot.recipeId!);
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
                  >
                    Delete from library
                  </button>
                )}
              </>
            ) : isViewRecipe && viewRecipe ? (
              <>
                {onRemoveFromLibrary && (
                  <button
                    type="button"
                    onClick={() => {
                      onRemoveFromLibrary(viewRecipe.id);
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl border border-red-200 text-red-600 font-medium text-sm hover:bg-red-50 transition-colors"
                  >
                    Delete from library
                  </button>
                )}
              </>
            ) : (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-skydark-text">Save to meal library</span>
              </label>
            )}

            <div className="flex gap-2 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isEdit) setViewMode(true);
                  else if (isViewRecipe) setViewRecipeViewMode(true);
                  else setShowAddForm(false);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1">
                {isEdit ? "Save" : "Add"}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

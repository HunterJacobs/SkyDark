import { useRef } from "react";
import { useDrag } from "react-dnd";
import type { MealRecipe } from "../../types/meals";

export const MEAL_RECIPE_TYPE = "meal-recipe";

interface DraggableMealCardProps {
  recipe: MealRecipe;
  usageCount?: number;
  rank?: number;
  /** Called when card is clicked without dragging (e.g. to view recipe). */
  onRecipeClick?: (recipe: MealRecipe) => void;
}

export default function DraggableMealCard({
  recipe,
  usageCount = 0,
  rank,
  onRecipeClick,
}: DraggableMealCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);
  const ingredientPreview = recipe.ingredients
    ?.slice(0, 2)
    .map((i) => i.name)
    .filter(Boolean)
    .join(" • ");

  const [{ isDragging }, drag] = useDrag({
    type: MEAL_RECIPE_TYPE,
    item: () => ({ recipe }),
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: () => {
      justDraggedRef.current = true;
    },
  });

  drag(ref);

  const handleClick = () => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    onRecipeClick?.(recipe);
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className="group w-full min-w-0 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden cursor-grab active:cursor-grabbing hover:border-skydark-accent hover:shadow-md transition-all"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="relative aspect-[4/3] w-full bg-gray-100 overflow-hidden">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-gray-400">
            🍽️
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/45 to-transparent" />
        {rank ? (
          <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-skydark-text">
            #{rank}
          </span>
        ) : null}
        <span className="absolute top-2 right-2 rounded-full bg-skydark-accent/90 px-2 py-0.5 text-xs font-semibold text-white">
          {usageCount}x this week
        </span>
        <div className="absolute bottom-2 left-3 right-3 text-white">
          <p
            className="text-sm font-semibold leading-snug max-h-[2.5rem] overflow-hidden drop-shadow"
            title={recipe.name}
          >
            {recipe.name}
          </p>
        </div>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-skydark-text-secondary">
          <span className="inline-flex items-center rounded-full bg-skydark-accent-bg px-2 py-0.5 text-skydark-accent">
            Drag to plan
          </span>
          {recipe.ingredients?.length ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5">
              {recipe.ingredients.length} ingredients
            </span>
          ) : null}
        </div>
        <p
          className="min-h-[1.25rem] text-xs text-skydark-text-secondary truncate"
          title={ingredientPreview || "No ingredients listed"}
        >
          {ingredientPreview || "No ingredients listed"}
        </p>
      </div>
    </div>
  );
}

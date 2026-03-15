import { useRef } from "react";
import { useDrag } from "react-dnd";
import type { MealRecipe } from "../../types/meals";

export const MEAL_RECIPE_TYPE = "meal-recipe";

interface DraggableMealCardProps {
  recipe: MealRecipe;
  /** Called when card is clicked without dragging (e.g. to view recipe). */
  onRecipeClick?: (recipe: MealRecipe) => void;
}

export default function DraggableMealCard({ recipe, onRecipeClick }: DraggableMealCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const justDraggedRef = useRef(false);

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
      className="flex-shrink-0 w-44 min-w-[11rem] rounded-xl border-2 border-gray-200 bg-white shadow-sm overflow-hidden cursor-grab active:cursor-grabbing hover:border-skydark-accent hover:shadow-md transition-all"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="aspect-square w-full bg-gray-100">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">
            🍽️
          </div>
        )}
      </div>
      <p className="p-2.5 text-sm font-medium text-skydark-text text-center line-clamp-2 break-words min-h-[2.5rem]" title={recipe.name}>
        {recipe.name}
      </p>
    </div>
  );
}

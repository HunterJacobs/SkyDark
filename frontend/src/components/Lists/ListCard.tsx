import { useState } from "react";
import ListItem from "./ListItem";
import CloseIcon from "../Common/CloseIcon";

export interface ListItemData {
  id: string;
  content: string;
  completed: boolean;
}

interface ListCardProps {
  id: string;
  name: string;
  color: string;
  ownerName?: string;
  items: ListItemData[];
  onAddItem: (content: string) => void;
  onToggleItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDeleteList?: () => void;
}

export default function ListCard({
  id: _id,
  name,
  color,
  ownerName,
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onDeleteList,
}: ListCardProps) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) {
      onAddItem(trimmed);
      setInput("");
    }
  };

  return (
    <div
      className="rounded-card overflow-hidden shadow-skydark flex flex-col min-w-[280px] max-w-sm"
      style={{ backgroundColor: `${color}30` }}
    >
      <div className="p-4 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-skydark-text truncate">{name}</h3>
          {ownerName && (
            <span className="text-xs text-skydark-text-secondary">{ownerName}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="px-2 py-0.5 rounded-full text-white text-sm font-medium"
            style={{ backgroundColor: color }}
          >
            {items.length}
          </span>
          {onDeleteList && (
            <button
              type="button"
              onClick={onDeleteList}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
              aria-label="Delete list"
              title="Delete list"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="px-4 pb-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add item"
          className="input-skydark"
        />
      </form>
      <ul className="flex-1 overflow-auto p-4 pt-0 space-y-1">
        {items.map((item) => (
          <ListItem
            key={item.id}
            item={item}
            onToggle={() => onToggleItem(item.id)}
            onDelete={() => onDeleteItem(item.id)}
          />
        ))}
      </ul>
    </div>
  );
}

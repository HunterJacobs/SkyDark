import { useState, useRef } from "react";
import ListCard, { type ListItemData } from "../components/Lists/ListCard";
import Modal from "../components/Common/Modal";
import PinPrompt from "../components/Common/PinPrompt";
import { useAppContext } from "../contexts/AppContext";
import { SKYDARK_COLORS } from "../lib/theme";

export interface ListData {
  id: string;
  name: string;
  color: string;
  owner_id?: string | null;
  items: ListItemData[];
}

const INITIAL_LISTS: ListData[] = [
  {
    id: "l1",
    name: "Buy for Bathroom",
    color: "#FFD4D4",
    owner_id: null,
    items: [
      { id: "i1", content: "Vanity", completed: false },
      { id: "i2", content: "Toilet", completed: false },
      { id: "i3", content: "Towels", completed: true },
    ],
  },
  {
    id: "l2",
    name: "Grocery List",
    color: "#E8D8F5",
    owner_id: null,
    items: [
      { id: "i4", content: "Spicy Dill Chips", completed: false },
      { id: "i5", content: "Pizza Rolls", completed: false },
      { id: "i6", content: "Fruit", completed: false },
    ],
  },
  {
    id: "l3",
    name: "To-Do",
    color: "#FFF4D4",
    owner_id: null,
    items: [
      { id: "i7", content: "Pay bills", completed: false },
      { id: "i8", content: "Call Mom", completed: true },
    ],
  },
];

export default function ListsView() {
  const { familyMembers, isFeatureLocked, verifyPin } = useAppContext();
  const [lists, setLists] = useState<ListData[]>(INITIAL_LISTS);
  const [filterOwnerId, setFilterOwnerId] = useState<string>("");
  const [addListOpen, setAddListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState<string>(SKYDARK_COLORS[0] ?? "#C8E6F5");
  const [newListOwnerId, setNewListOwnerId] = useState<string>("");
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

  const addItem = (listId: string, content: string) => {
    if (isFeatureLocked("addItemsToLists")) {
      runAfterPin(() => doAddItem(listId, content));
      return;
    }
    doAddItem(listId, content);
  };

  const doAddItem = (listId: string, content: string) => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list;
        const newItem: ListItemData = {
          id: `i${Date.now()}`,
          content,
          completed: false,
        };
        return { ...list, items: [...list.items, newItem] };
      })
    );
  };

  const toggleItem = (listId: string, itemId: string) => {
    if (isFeatureLocked("checkLists")) {
      runAfterPin(() => doToggleItem(listId, itemId));
      return;
    }
    doToggleItem(listId, itemId);
  };

  const doToggleItem = (listId: string, itemId: string) => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list;
        return {
          ...list,
          items: list.items.map((i) =>
            i.id === itemId ? { ...i, completed: !i.completed } : i
          ),
        };
      })
    );
  };

  const deleteItem = (listId: string, itemId: string) => {
    setLists((prev) =>
      prev.map((list) => {
        if (list.id !== listId) return list;
        return {
          ...list,
          items: list.items.filter((i) => i.id !== itemId),
        };
      })
    );
  };

  const deleteList = (listId: string) => {
    if (!window.confirm("Delete this list and all its items?")) return;
    if (isFeatureLocked("deleteLists")) {
      runAfterPin(() => setLists((prev) => prev.filter((l) => l.id !== listId)));
      return;
    }
    setLists((prev) => prev.filter((l) => l.id !== listId));
  };

  const createList = () => {
    const name = newListName.trim();
    if (!name) return;
    if (isFeatureLocked("createLists")) {
      runAfterPin(() => doCreateList(name));
      return;
    }
    doCreateList(name);
  };

  const doCreateList = (name: string) => {
    setLists((prev) => [
      ...prev,
      {
        id: `l${Date.now()}`,
        name,
        color: newListColor,
        owner_id: newListOwnerId || null,
        items: [],
      },
    ]);
    setNewListName("");
    setNewListColor(SKYDARK_COLORS[0] ?? "#C8E6F5");
    setNewListOwnerId("");
    setAddListOpen(false);
  };

  const filteredLists = filterOwnerId
    ? lists.filter((l) => (l.owner_id ?? "") === filterOwnerId)
    : lists;

  return (
    <div className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h2 className="text-lg font-semibold text-skydark-text">Lists</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2">
            <span className="text-sm text-skydark-text-secondary">Assignee:</span>
            <select
              value={filterOwnerId}
              onChange={(e) => setFilterOwnerId(e.target.value)}
              className="input-skydark py-2 min-w-[120px]"
            >
              <option value="">All</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setAddListOpen(true)}
            className="btn-primary"
          >
            + New list
          </button>
        </div>
      </div>
      <div className="flex gap-6 overflow-x-auto pb-4">
        {filteredLists.map((list) => (
          <ListCard
            key={list.id}
            id={list.id}
            name={list.name}
            color={list.color}
            ownerName={familyMembers.find((m) => m.id === list.owner_id)?.name}
            items={list.items}
            onAddItem={(content) => addItem(list.id, content)}
            onToggleItem={(itemId) => toggleItem(list.id, itemId)}
            onDeleteItem={(itemId) => deleteItem(list.id, itemId)}
            onDeleteList={() => deleteList(list.id)}
          />
        ))}
      </div>

      <Modal open={addListOpen} onClose={() => setAddListOpen(false)} title="Create list">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1">List name</label>
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="input-skydark"
              placeholder="e.g. Grocery"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {SKYDARK_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewListColor(c)}
                  className="w-8 h-8 rounded-full border-2"
                  style={{
                    backgroundColor: c,
                    borderColor: newListColor === c ? "#2B3A4A" : "transparent",
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-skydark-text mb-1">Assign to</label>
            <select
              value={newListOwnerId}
              onChange={(e) => setNewListOwnerId(e.target.value)}
              className="input-skydark"
            >
              <option value="">Everyone</option>
              {familyMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setAddListOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="button"
              onClick={createList}
              disabled={!newListName.trim()}
              className="btn-primary flex-1 disabled:opacity-60"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
      <PinPrompt
        open={showPinPrompt}
        onClose={() => {
          setShowPinPrompt(false);
          pendingActionRef.current = null;
        }}
        onVerify={handlePinVerify}
        title="Enter PIN"
      />
    </div>
  );
}

/**
 * Standalone SkyDark API server (no Home Assistant).
 * Accepts HA-style WebSocket message payloads via POST /api/ws and returns result.
 */
import express from "express";
import cors from "cors";
import {
  initDb,
  getEvents,
  getTasks,
  getLists,
  getAllListItems,
  getFamilyMembers,
  getMeals,
  getPointsByMember,
  getRewards,
  getConfig,
  addEvent,
  completeTask,
  addPoints,
  redeemReward,
  createList,
  addListItem,
  addMealRecipe,
  updateEvent,
  deleteEvent,
  addTask,
  updateTask,
  deleteTask,
  uncompleteTask,
  toggleListItem,
  deleteListItem,
  deleteList,
  addMeal,
  updateMeal,
  deleteMeal,
  getMealRecipesWithIngredients,
  deleteMealRecipe,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  addReward,
  deleteReward,
} from "./db.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function handleMessage(msg) {
  const { type, id } = msg;
  const sendResult = (result) => ({ id, type: "result", success: true, result });
  const sendError = (code, message) => ({ id, type: "result", success: false, error: { code, message } });

  switch (type) {
    case "skydark_calendar/get_events": {
      const result = getEvents(msg.start_date, msg.end_date);
      return sendResult({ events: result });
    }
    case "skydark_calendar/get_tasks": {
      const tasks = getTasks();
      return sendResult({ tasks });
    }
    case "skydark_calendar/get_lists": {
      const lists = getLists();
      const list_items = getAllListItems();
      return sendResult({ lists, list_items });
    }
    case "skydark_calendar/get_family_members": {
      const family_members = getFamilyMembers();
      return sendResult({ family_members });
    }
    case "skydark_calendar/get_meals": {
      const meals = getMeals(msg.start_date, msg.end_date);
      return sendResult({ meals });
    }
    case "skydark_calendar/get_config": {
      const config = getConfig();
      return sendResult(config);
    }
    case "skydark_calendar/get_points": {
      const points_by_member = getPointsByMember();
      return sendResult({ points_by_member });
    }
    case "skydark_calendar/get_rewards": {
      const rewards = getRewards();
      return sendResult({ rewards });
    }
    case "skydark_calendar/get_meal_recipes": {
      const recipes = getMealRecipesWithIngredients();
      return sendResult({ recipes });
    }
    case "call_service": {
      if (msg.domain !== "skydark_calendar") return sendError("invalid_domain", "Unknown domain");
      const sd = msg.service_data || {};
      try {
        switch (msg.service) {
          case "add_event":
            addEvent(sd);
            return sendResult({});
          case "update_event":
            updateEvent(sd.event_id, sd);
            return sendResult({});
          case "delete_event":
            deleteEvent(sd.event_id);
            return sendResult({});
          case "complete_task":
            completeTask(sd.task_id, sd.completed_date, sd.points ?? 0);
            return sendResult({});
          case "uncomplete_task":
            uncompleteTask(sd.task_id);
            return sendResult({});
          case "add_task":
            addTask(sd);
            return sendResult({});
          case "update_task":
            updateTask(sd.task_id, sd);
            return sendResult({});
          case "delete_task":
            deleteTask(sd.task_id);
            return sendResult({});
          case "add_points":
            addPoints(sd.member_id, sd.points, sd.reason, sd.task_id);
            return sendResult({});
          case "redeem_reward":
            return sendResult({ success: redeemReward(sd.member_id, sd.reward_id) });
          case "add_reward":
            addReward(sd);
            return sendResult({});
          case "delete_reward":
            deleteReward(sd.reward_id);
            return sendResult({});
          case "create_list":
            createList(sd.name, sd.color, sd.owner_id, sd.list_type ?? "general");
            return sendResult({});
          case "delete_list":
            deleteList(sd.list_id);
            return sendResult({});
          case "add_list_item":
            addListItem(sd.list_id, sd.content);
            return sendResult({});
          case "toggle_list_item":
            toggleListItem(sd.item_id);
            return sendResult({});
          case "delete_list_item":
            deleteListItem(sd.item_id);
            return sendResult({});
          case "add_meal":
            addMeal(sd);
            return sendResult({});
          case "update_meal":
            updateMeal(sd.meal_id, sd);
            return sendResult({});
          case "delete_meal":
            deleteMeal(sd.meal_id);
            return sendResult({});
          case "add_meal_recipe":
            addMealRecipe(sd.name, sd.ingredients ?? []);
            return sendResult({});
          case "delete_meal_recipe":
            deleteMealRecipe(sd.recipe_id);
            return sendResult({});
          case "add_family_member":
            addFamilyMember(sd);
            return sendResult({});
          case "update_family_member":
            updateFamilyMember(sd.member_id, sd);
            return sendResult({});
          case "delete_family_member":
            deleteFamilyMember(sd.member_id);
            return sendResult({});
          default:
            return sendError("invalid_service", "Unknown service: " + msg.service);
        }
      } catch (err) {
        console.error("call_service error:", err);
        return sendError("failed", err.message || "Service failed");
      }
    }
    default:
      return sendError("invalid_type", "Unknown message type: " + type);
  }
}

app.post("/api/ws", (req, res) => {
  const msg = req.body;
  if (!msg || typeof msg.type !== "string") {
    return res.status(400).json({ error: "Missing type" });
  }
  const response = handleMessage(msg);
  res.json(response);
});

const PORT = Number(process.env.PORT) || 4000;
const main = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log("SkyDark standalone API on http://localhost:" + PORT);
    console.log("POST /api/ws – HA-style message handler");
  });
};
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

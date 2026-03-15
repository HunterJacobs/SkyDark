# Default photos

On **first load** (no saved data), the app shows these 8 images: `1.png` through `8.png`.

- **To use your own default images:** Replace `1.png` … `8.png` in this folder with your own files (same names), then run `npm run build` in the `frontend` folder. New users will see your images as the default set.
- **Saved and deleted photos:** The app stores the current photo list in the browser (localStorage). So:
  - Additions and deletions **persist** across refreshes and code updates.
  - If a user deletes a photo, it stays deleted.
  - Local/imported photos are stored as data and stay until the user deletes them.

Do not rely on adding extra files (e.g. `9.png`, `10.png`) to this folder to add more “default” photos—the app only uses `1.png`–`8.png` as the initial set. To add more photos, use **Import photos** in the Photos tab.

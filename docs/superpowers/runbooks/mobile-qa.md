# Mobile QA Matrix (per release)

| Platform | Device | Tester | Result |
|---|---|---|---|
| iOS | iPhone 15 (latest iOS) | | ☐ pass / ☐ fail |
| iOS | iPhone SE (oldest supported) | | ☐ pass / ☐ fail |
| Android | Pixel 8 (latest Android) | | ☐ pass / ☐ fail |
| Android | Samsung Galaxy A14 (mid-tier) | | ☐ pass / ☐ fail |

## Per-device golden-path checklist

1. Cold-launch the app. Home renders within 3 seconds. ☐
2. Open Listings. Both buildings appear. ☐
3. Tap into a unit. Photos render. Schedule a showing button visible. ☐
4. Tap Schedule a showing. Submit a request with preferred dates. See success screen with ref id. ☐
5. Receive confirmation email within 60 seconds. ☐
6. Open Maintenance tab. Submit a request with one photo from camera. See success screen. ☐
7. Verify photo appears in Supabase Storage `maintenance-uploads` bucket within 30 seconds. ☐
8. Background the app for 10 minutes, foreground it. State preserved or graceful re-fetch. ☐
9. Airplane mode toggle: error message visible and recoverable. ☐

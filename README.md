# Shopping Cart Mobile - WebView App

Expo React Native WebView app for iOS and Android.

## Setup

1. **Update Web URL**: Edit `App.js` and replace `your-web-app-url.com` with your actual web app URL

2. **Install Dependencies**:
```bash
npm install
```

3. **Configure App Identifiers**: Update `app.json`:
   - iOS: Change `bundleIdentifier` (e.g., `com.mycompany.myapp`)
   - Android: Change `package` name (e.g., `com.mycompany.myapp`)

## Development

Start Expo development server:
```bash
npx expo start
```

Run on specific platform:
```bash
npm run android  # Android
npm run ios      # iOS (Mac only)
npm run web      # Web browser
```

## Building for App Stores

### Prerequisites
1. Install EAS CLI: `npm install -g eas-cli`
2. Create Expo account: https://expo.dev/signup
3. Login: `eas login`

### Configure Build
```bash
eas build:configure
```

### Build for Android (APK/AAB)
```bash
eas build --platform android --profile production
```

For Play Store submission, use AAB:
```bash
eas build --platform android --profile production
```

### Build for iOS
```bash
eas build --platform ios --profile production
```

**Note**: iOS builds require Apple Developer account ($99/year)

### Submit to Stores

**Google Play Store**:
```bash
eas submit --platform android
```

**Apple App Store**:
```bash
eas submit --platform ios
```

## WebView Configuration

The WebView in `App.js` includes:
- JavaScript enabled
- DOM storage enabled
- Loading indicator
- Media playback support
- Auto-adjusting to device orientation

## Assets

Replace placeholder assets in `/assets`:
- `icon.png` - App icon (1024x1024)
- `splash-icon.png` - Splash screen
- `adaptive-icon.png` - Android adaptive icon
- `favicon.png` - Web favicon

## Project Structure

```
├── App.js              # Main WebView component
├── app.json            # Expo configuration
├── eas.json            # Build configuration
├── package.json        # Dependencies
└── assets/             # App icons and images
```

## Troubleshooting

**WebView not loading**: Check CORS settings on your web server
**Build fails**: Ensure bundle identifiers are unique and valid
**iOS signing**: Configure in Apple Developer Console

## Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)

/**
 * @format
 */

// Must load before anything that touches Supabase: RN has no spec-compliant
// URL/URLSearchParams, and supabase-js reaches for both at module load.
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);

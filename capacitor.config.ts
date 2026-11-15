import type {CapacitorConfig} from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cashtrace.app',
  appName: 'CashTrace',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f8fafc',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

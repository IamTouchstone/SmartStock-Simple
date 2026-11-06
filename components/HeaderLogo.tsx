import { Image, useColorScheme, View } from 'react-native';

export default function HeaderLogo() {
  const scheme = useColorScheme();
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
      <Image
        source={scheme === 'dark'
          ? require('../assets/images/logo-horizontal-dark.png')
          : require('../assets/images/logo-horizontal-light.png')}
        style={{ width: 180, height: 48 }}
        resizeMode="contain"
      />
    </View>
  );
}
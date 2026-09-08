import type { Product } from '../src/product';
import { registerRootComponent } from 'expo';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import { bootProduct } from '../src/product';
import { favoritesView, Frame, ProductView, shell } from '../src/ui';
import * as storage from './storage';

export default function App() {
  const [product, setProduct] = useState<Product>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const boot = bootProduct(storage, shell, favoritesView);
    void boot.then((value) => {
      if (active)
        setProduct(value);
    }).catch((reason) => {
      if (active)
        setError(String(reason));
    });
    return () => {
      active = false;
      void boot.then(value => value.dispose()).catch(console.error);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        {product
          ? <ProductView product={product} host="React Native" />
          : <Frame host="React Native"><Text>{error || '正在加载收藏…'}</Text></Frame>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);

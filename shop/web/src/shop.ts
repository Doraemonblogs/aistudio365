import { reactive } from 'vue';
import { api, type Shop } from './api';
import { errorMessage } from './format';

/** Shop name, logo, notice, contacts and categories; loaded once per visit. */
export const shopState = reactive<{ shop: Shop | null; error: string }>({ shop: null, error: '' });

let loading: Promise<void> | null = null;

export function loadShop(): Promise<void> {
  loading ??= api
    .shop()
    .then((shop) => {
      shopState.shop = shop;
      shopState.error = '';
      if (document.title === 'AIStudio365' || !document.title) document.title = shop.shop_name;
      if (shop.logo) setFavicon(shop.logo);
    })
    .catch((error: unknown) => {
      shopState.error = errorMessage(error);
      loading = null;
    });
  return loading;
}

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

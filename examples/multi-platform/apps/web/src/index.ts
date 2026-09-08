import { mount } from '@examples/multi-platform-shared/dom';
import * as config from 'virtual:cordis-web';

const boot = mount(config, 'Web');
window.addEventListener('pagehide', (event) => {
  if (!event.persisted)
    void boot.then(dispose => dispose());
});

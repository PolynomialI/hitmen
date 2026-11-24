import type { GameMode } from '../../shared/types';
import type { Screen } from '../app';
import type { Nav } from '../screens/menus';
export class MatchScreen implements Screen {
  constructor(nav: Nav, mode: GameMode) {
    void nav;
    void mode;
  }
}

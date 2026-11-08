import React from 'react';
import { ShoppingBag, Newspaper, Image as GalleryIcon, Settings, Power, Tv } from 'lucide-react';
import type { MockSystemState } from '../../types/simulation';
import type { ThemeScreen, PaneNode } from '../../types/theme';

interface HomeMenuRendererProps {
  activeScreen: ThemeScreen;
  mockState: MockSystemState;
  selectedPaneId: string | null;
  onSelectPane: (paneId: string | null) => void;
  onUpdateMockState: (updates: Partial<MockSystemState>) => void;
}

export const HomeMenuRenderer: React.FC<HomeMenuRendererProps> = ({
  activeScreen,
  mockState,
  selectedPaneId,
  onSelectPane,
  onUpdateMockState,
}) => {
  const selectedIndex = mockState.selectedGameIndex;
  const selectedGame = mockState.games[selectedIndex] || mockState.games[0];
  const activeUser = mockState.users[0] || { id: 'u1', name: 'User', avatarBg: '#e11d48', avatarIcon: '🍄' };
  const isDark = mockState.isDarkTheme;

  // Extract pane properties with fallbacks matching Vertical-OEM
  const getPane = (name: string, fallback: Partial<PaneNode> = {}) => {
    const p = activeScreen.panes.find((item) => item.name === name);
    return {
      id: p?.id || `pane-${name}`,
      name,
      x: p?.x ?? fallback.x ?? 0,
      y: p?.y ?? fallback.y ?? 0,
      width: p?.width ?? fallback.width ?? 100,
      height: p?.height ?? fallback.height ?? 100,
      scaleX: p?.scaleX ?? fallback.scaleX ?? 1,
      scaleY: p?.scaleY ?? fallback.scaleY ?? 1,
      visible: p?.visible ?? fallback.visible ?? true,
    };
  };

  const myPage = getPane('N_MyPage', { x: -313, y: 300, scaleX: 0.9, scaleY: 0.9 });
  const hud = getPane('L_Hud', { x: 584, y: 300, scaleX: 1, scaleY: 1 });
  const systemApplets = getPane('N_System', { x: 0, y: -219, scaleX: 0.7, scaleY: 0.7 });
  const iconGame = getPane('P_IconGame', { width: 256, height: 384, scaleX: 1, scaleY: 1 });
  const tip = getPane('N_Tip', { x: 0, y: 222, scaleX: 0.9, scaleY: 0.9 });
  const footer = getPane('L_BtnFooter', { x: 0, y: -300, scaleX: 1, scaleY: 1 });

  // Dimensions
  const cardWidth = iconGame.width || 256;
  const cardHeight = iconGame.height || 384;
  const isVertical = cardHeight > 300;
  const cardGap = 24;
  const cardStep = cardWidth + cardGap;

  // Focus position: in Vertical OEM, the focused card aligns at X = 412
  const focusX = isVertical ? 412 : 512;
  const carouselTranslateX = focusX - selectedIndex * cardStep;

  // Vertical positions
  const cardTop = isVertical ? 212 : 232;

  // 7 Official Nintendo Switch System Applets
  const appletButtons = [
    ...(activeScreen.hideOnlineBtn
      ? []
      : [
          {
            id: 'nso',
            isRed: true,
            icon: <Tv className="w-5 h-5 text-white" />,
            label: 'Nintendo Switch Online',
          },
        ]),
    {
      id: 'news',
      isRed: false,
      color: '#e60012',
      icon: <Newspaper className="w-5 h-5" style={{ color: '#e60012' }} />,
      label: 'News',
    },
    {
      id: 'eshop',
      isRed: false,
      color: '#ff7d00',
      icon: <ShoppingBag className="w-5 h-5" style={{ color: '#ff7d00' }} />,
      label: 'Nintendo eShop',
    },
    {
      id: 'album',
      isRed: false,
      color: '#00a2e8',
      icon: <GalleryIcon className="w-5 h-5" style={{ color: '#00a2e8' }} />,
      label: 'Album',
    },
    {
      id: 'controllers',
      isRed: false,
      color: isDark ? '#cbd5e1' : '#475569',
      icon: (
        <div className="w-5 h-5 flex items-center justify-center gap-0.5">
          <div className={`w-2 h-4 rounded-l-sm border ${isDark ? 'border-slate-300' : 'border-slate-600'}`} />
          <div className={`w-2 h-4 rounded-r-sm border ${isDark ? 'border-slate-300' : 'border-slate-600'}`} />
        </div>
      ),
      label: 'Controllers',
    },
    {
      id: 'settings',
      isRed: false,
      color: isDark ? '#cbd5e1' : '#475569',
      icon: <Settings className="w-5 h-5" style={{ color: isDark ? '#cbd5e1' : '#475569' }} />,
      label: 'System Settings',
    },
    {
      id: 'sleep',
      isRed: false,
      color: isDark ? '#cbd5e1' : '#475569',
      icon: <Power className="w-5 h-5" style={{ color: isDark ? '#cbd5e1' : '#475569' }} />,
      label: 'Sleep Mode',
    },
  ];

  return (
    <div
      className={`absolute inset-0 w-[1280px] h-[720px] overflow-hidden select-none pointer-events-auto transition-colors duration-200 ${
        isDark ? 'text-white' : 'text-[#2d2d2d]'
      }`}
      style={{
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {/* ============================================================== */}
      {/* SWITCH OS SIGNATURE DIVIDER LINES                              */}
      {/* ============================================================== */}
      <div
        className="absolute left-0 right-0 h-[1px] pointer-events-none"
        style={{
          top: '114px',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
        }}
      />
      <div
        className="absolute left-0 right-0 h-[1px] pointer-events-none"
        style={{
          top: '648px',
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
        }}
      />

      {/* ============================================================== */}
      {/* 1. N_MyPage: TOP USER AVATARS (Aligned at X = 372 in Vertical OEM) */}
      {/* ============================================================== */}
      {myPage.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(myPage.id);
          }}
          className={`absolute flex items-center gap-2.5 cursor-pointer p-1 rounded-full transition-transform ${
            selectedPaneId === myPage.id ? 'ring-2 ring-[#10b981]' : ''
          }`}
          style={{
            left: `${640 + myPage.x}px`,
            top: `${360 - myPage.y - 20}px`,
            transform: `scale(${myPage.scaleX}, ${myPage.scaleY})`,
            transformOrigin: 'left center',
          }}
        >
          {mockState.users.map((u) => (
            <div
              key={u.id}
              className={`w-11 h-11 rounded-full border-2 shadow-md flex items-center justify-center text-lg transition transform hover:scale-105 ${
                isDark ? 'border-white/90' : 'border-white'
              }`}
              style={{ backgroundColor: u.avatarBg }}
              title={u.name}
            >
              {u.avatarIcon}
            </div>
          ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. L_Hud: STATUS HUD (Clock, Wi-Fi, Battery)                   */}
      {/* ============================================================== */}
      {hud.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(hud.id);
          }}
          className={`absolute flex items-center gap-3.5 text-sm font-semibold tracking-wide cursor-pointer p-1 rounded transition-transform ${
            selectedPaneId === hud.id ? 'ring-2 ring-[#10b981]' : ''
          }`}
          style={{
            left: `${640 + hud.x - 220}px`,
            top: `${360 - hud.y - 14}px`,
            transform: `scale(${hud.scaleX}, ${hud.scaleY})`,
            transformOrigin: 'right center',
          }}
        >
          {/* Digital Time */}
          <span className="font-mono text-base font-bold tracking-tight">
            {mockState.time}
          </span>

          {/* Wi-Fi 3-bar icon */}
          <div className="flex items-end gap-0.5 h-3.5">
            <span
              className="w-1 rounded-sm"
              style={{
                height: '5px',
                backgroundColor: isDark ? '#ffffff' : '#2d2d2d',
              }}
            />
            <span
              className="w-1 rounded-sm"
              style={{
                height: '9px',
                backgroundColor: isDark ? '#ffffff' : '#2d2d2d',
              }}
            />
            <span
              className="w-1 rounded-sm"
              style={{
                height: '14px',
                backgroundColor: isDark ? '#ffffff' : '#2d2d2d',
              }}
            />
          </div>

          {/* Battery percentage & gauge */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono font-bold">{mockState.battery}%</span>
            <div
              className={`relative w-7 h-3.5 rounded-sm border flex items-center p-0.5 ${
                isDark ? 'border-white/80' : 'border-[#2d2d2d]'
              }`}
            >
              {/* Battery terminal nib */}
              <div
                className={`absolute -right-1 top-1 w-0.5 h-1.5 rounded-r-xs ${
                  isDark ? 'bg-white/80' : 'bg-[#2d2d2d]'
                }`}
              />
              {/* Battery level fill */}
              <div
                className="h-full rounded-xs transition-all"
                style={{
                  width: `${mockState.battery}%`,
                  backgroundColor:
                    mockState.battery <= 20 ? '#ef4444' : isDark ? '#ffffff' : '#2d2d2d',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. N_Tip: GAME TITLE (Directly aligned with focused card)       */}
      {/* ============================================================== */}
      {tip.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(tip.id);
          }}
          className={`absolute flex items-center cursor-pointer transition ${
            selectedPaneId === tip.id ? 'ring-2 ring-[#10b981]' : ''
          }`}
          style={{
            left: `${focusX}px`,
            top: `${cardTop - 42}px`,
            width: '800px',
            transform: `scale(${tip.scaleX}, ${tip.scaleY})`,
            transformOrigin: 'left bottom',
          }}
        >
          <h1
            className="text-xl font-bold tracking-tight text-[#00c8c8] drop-shadow-sm truncate"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {selectedGame?.title || 'Game Title'}
          </h1>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. P_IconGame: CAROUSEL WITH AUTO-FOCUS POSITIONING            */}
      {/* ============================================================== */}
      {iconGame.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(iconGame.id);
          }}
          className={`absolute cursor-pointer transition ${
            selectedPaneId === iconGame.id ? 'ring-2 ring-[#10b981]/50' : ''
          }`}
          style={{
            top: `${cardTop}px`,
            left: 0,
            right: 0,
            height: `${cardHeight + 48}px`,
          }}
        >
          {/* Animated Scroll Track */}
          <div
            className="absolute flex items-start transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(${carouselTranslateX}px)`,
              gap: `${cardGap}px`,
            }}
          >
            {mockState.games.map((game, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={game.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateMockState({ selectedGameIndex: index });
                    onSelectPane(iconGame.id);
                  }}
                  className={`relative shrink-0 rounded-xs overflow-hidden cursor-pointer transition-all duration-200 select-none ${
                    isSelected
                      ? 'shadow-2xl z-20'
                      : 'opacity-90 hover:opacity-100 hover:scale-[1.01] shadow-md'
                  }`}
                  style={{
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    // Authentic Switch Cyan Border on Selected Card
                    boxShadow: isSelected
                      ? '0 0 0 4px #00e5e5, 0 12px 28px rgba(0,0,0,0.45)'
                      : '0 4px 12px rgba(0,0,0,0.25)',
                  }}
                >
                  <img
                    src={game.coverUrl}
                    alt={game.title}
                    className="w-full h-full object-cover pointer-events-none"
                    draggable={false}
                  />

                  {/* Authentic Switch "Playing" Badge on Selected Card */}
                  {isSelected && (
                    <div className="absolute bottom-3 left-3 flex items-center bg-black/90 backdrop-blur-md rounded-full px-2.5 py-1 gap-1.5 shadow-lg border border-white/20">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] text-white"
                        style={{ backgroundColor: activeUser.avatarBg }}
                      >
                        {activeUser.avatarIcon}
                      </div>
                      <span className="text-[11px] font-semibold text-white tracking-wide">
                        Playing
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Under-Card Action Hint: Change User (Y) directly below focused card */}
          <div
            className="absolute flex items-center gap-1.5 text-xs font-semibold text-[#00c8c8] transition-transform duration-300"
            style={{
              left: `${focusX}px`,
              top: `${cardHeight + 10}px`,
            }}
          >
            <span className="w-4 h-4 rounded-full bg-[#00c8c8] text-[#0c0e12] text-[10px] font-bold flex items-center justify-center shadow-sm">
              Y
            </span>
            <span>Change User</span>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. N_System: THE 7 OFFICIAL SWITCH APPLET BUTTONS              */}
      {/* ============================================================== */}
      {systemApplets.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(systemApplets.id);
          }}
          className={`absolute flex items-center justify-center gap-3.5 cursor-pointer p-1 rounded-full transition ${
            selectedPaneId === systemApplets.id ? 'ring-2 ring-[#10b981]' : ''
          }`}
          style={{
            left: '50%',
            top: `${360 - systemApplets.y - 24}px`,
            transform: `translateX(-50%) scale(${systemApplets.scaleX}, ${systemApplets.scaleY})`,
            transformOrigin: 'center center',
          }}
        >
          {appletButtons.map((btn) => (
            <div
              key={btn.id}
              className={`w-12 h-12 rounded-full flex items-center justify-center cursor-pointer transition transform hover:scale-110 shadow-md ${
                btn.isRed
                  ? 'bg-[#e60012] text-white hover:brightness-110'
                  : isDark
                  ? 'bg-[#333333] hover:bg-[#3d3d3d] border border-white/15'
                  : 'bg-white hover:bg-slate-50 border border-black/10'
              }`}
              title={btn.label}
            >
              {btn.icon}
            </div>
          ))}
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. L_BtnFooter: OFFICIAL SWITCH CONTROLLER PROMPTS             */}
      {/* ============================================================== */}
      {footer.visible && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelectPane(footer.id);
          }}
          className={`absolute flex items-center justify-between cursor-pointer px-12 transition ${
            selectedPaneId === footer.id ? 'ring-2 ring-[#10b981]' : ''
          }`}
          style={{
            left: 0,
            right: 0,
            top: `${360 - footer.y - 20}px`,
            transform: `scale(${footer.scaleX}, ${footer.scaleY})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Handheld Switch Console Glyph */}
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-4 rounded-sm border-2 flex items-center justify-between px-0.5 ${
                isDark ? 'border-white/80' : 'border-[#2d2d2d]'
              }`}
            >
              <div
                className={`w-1 h-2 rounded-xs ${
                  isDark ? 'bg-white/80' : 'bg-[#2d2d2d]'
                }`}
              />
              <div
                className={`w-1 h-2 rounded-xs ${
                  isDark ? 'bg-white/80' : 'bg-[#2d2d2d]'
                }`}
              />
            </div>
          </div>

          {/* Action Button Prompts with Circular Badges */}
          <div className="flex items-center gap-5 text-xs font-semibold drop-shadow-xs">
            <span className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDark ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white'
                }`}
              >
                +
              </span>
              <span>Options</span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDark ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white'
                }`}
              >
                Y
              </span>
              <span>Change User</span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDark ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white'
                }`}
              >
                X
              </span>
              <span>Close Software</span>
            </span>

            <span className="flex items-center gap-1.5">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isDark ? 'bg-white text-black' : 'bg-[#1e1e1e] text-white'
                }`}
              >
                A
              </span>
              <span>Continue</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

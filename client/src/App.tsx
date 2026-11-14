import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import { CallProvider } from './context/CallContext';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { LoginPage } from './components/LoginPage';
import { LoginModal } from './components/LoginModal';
import { NewChatModal } from './components/NewChatModal';
import { TwoFactorSettingsModal } from './components/TwoFactorSettingsModal';
import { DevToolsPanel } from './components/DevToolsPanel';
import { AddFriendModal } from './components/AddFriendModal';
import { StoredChatsModal } from './components/StoredChatsModal';
import { CallModal } from './components/CallModal';
import { IncomingCallModal } from './components/IncomingCallModal';

const TelegramDashboard: React.FC = () => {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [is2FAOpen, setIs2FAOpen] = useState(false);
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const [isStoredChatsOpen, setIsStoredChatsOpen] = useState(false);

  return (
    <div className="telegram-app">
      <Sidebar
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onOpenNewChat={() => setIsNewChatOpen(true)}
        onOpenAddFriend={() => setIsAddFriendOpen(true)}
        onOpen2FA={() => setIs2FAOpen(true)}
        onOpenStoredChats={() => setIsStoredChatsOpen(true)}
      />

      <ChatArea
        onToggleDevTools={() => setIsDevToolsOpen((prev) => !prev)}
        isDevToolsOpen={isDevToolsOpen}
      />

      <AddFriendModal
        isOpen={isAddFriendOpen}
        onClose={() => setIsAddFriendOpen(false)}
      />

      <StoredChatsModal
        isOpen={isStoredChatsOpen}
        onClose={() => setIsStoredChatsOpen(false)}
      />

      <TwoFactorSettingsModal
        isOpen={is2FAOpen}
        onClose={() => setIs2FAOpen(false)}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      <NewChatModal
        isOpen={isNewChatOpen}
        onClose={() => setIsNewChatOpen(false)}
      />

      <DevToolsPanel
        isOpen={isDevToolsOpen}
        onClose={() => setIsDevToolsOpen(false)}
      />

      {/* Real-time Call Modals */}
      <CallModal />
      <IncomingCallModal />
    </div>
  );
};

const MainContent: React.FC = () => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <ChatProvider>
      <CallProvider>
        <TelegramDashboard />
      </CallProvider>
    </ChatProvider>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
};

export default App;

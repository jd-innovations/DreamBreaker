import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Tournaments from "@/pages/Tournaments";
import TournamentDetail from "@/pages/TournamentDetail";
import Matchmaking from "@/pages/Matchmaking";
import PlayerDashboard from "@/pages/PlayerDashboard";
import DirectorDashboard from "@/pages/DirectorDashboard";
import AdminDashboard from "@/pages/AdminDashboard";
import PlayerProfile from "@/pages/PlayerProfile";
import Brackets from "@/pages/Brackets";

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/tournaments" element={<Tournaments />} />
            <Route path="/tournaments/:id" element={<TournamentDetail />} />
            <Route path="/matchmaking" element={<Matchmaking />} />
            <Route path="/dashboard" element={<PlayerDashboard />} />
            <Route path="/director" element={<DirectorDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/profile" element={<PlayerProfile />} />
            <Route path="/brackets" element={<Brackets />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </div>
    </ThemeProvider>
  );
}

export default App;

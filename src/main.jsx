import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import '@fontsource-variable/inter';
import LiveBank from './LiveBank';
import BankApp from './BankApp';
import bank from './bank-config';
import './style.css';

document.title = bank.name + ' | Banking portal';
document.documentElement.dataset.bank = bank.theme;
const theme = createTheme({
  palette: { primary: { main: bank.color } },
  shape: { borderRadius: 10 },
  typography: { fontFamily: '"Inter Variable", Inter, sans-serif', button: { textTransform: 'none', fontWeight: 680 } },
  components: { MuiButton: { defaultProps: { disableElevation: true } } },
});
const switchUrl = 'https://sriramtpsiog.github.io/SharedDB/';
function App() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const handle = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  }, []);
  // Original application remains unchanged and available for comparison.
  return hash.startsWith('#/live') ? <LiveBank bank={bank} switchUrl={switchUrl} /> : <BankApp />;
}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>);

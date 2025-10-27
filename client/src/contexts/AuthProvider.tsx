import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  profilePicture?: string;
  createdAt?: string;
  stripeCustomerId?: string | null;
  // Two-factor authentication fields
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string | null;
  twoFactorBackupCodes?: string | null;
  twoFactorMethod?: string;
  twoFactorEmailCode?: string | null;
  twoFactorEmailCodeExpiry?: string | null;
  // Color preference fields
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  textColorSecondary?: string;
  // Notification preference fields
  emailAccountManagement?: boolean;
  emailAppointmentReminders?: boolean;
  emailPromotions?: boolean;
  smsAccountManagement?: boolean;
  smsAppointmentReminders?: boolean;
  smsPromotions?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (userData: User, token?: string) => void;
  logout: () => void;
  updateUser: (updatedUserData: Partial<User>) => void;
  loading: boolean;
  colorPreferencesApplied: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  login: () => {},
  logout: () => {},
  updateUser: () => {},
  loading: true,
  colorPreferencesApplied: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [colorPreferencesApplied, setColorPreferencesApplied] = useState(false);

  // Helper to refresh the current user from the server using the token when available
  const refreshUserFromServer = async (fallbackUserId?: number): Promise<User | null> => {
    try {
      const token = localStorage.getItem('token');
      // Try auth verify first when token exists
      if (token) {
        const verifyRes = await fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (verifyRes.ok) {
          const data = await verifyRes.json();
          const verifiedUser: User | null = data?.user || null;
          if (verifiedUser) {
            setUser(verifiedUser);
            localStorage.setItem('user', JSON.stringify(verifiedUser));
            window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: verifiedUser }));
            return verifiedUser;
          }
        }
      }

      // Fallback to direct user fetch by id
      const storedUser = localStorage.getItem('user');
      const id = fallbackUserId || (storedUser ? (JSON.parse(storedUser) as User).id : undefined);
      if (!id) return null;
      const res = await fetch(`/api/users/${id}`);
      if (!res.ok) return null;
      const fresh = (await res.json()) as User;
      setUser(fresh);
      localStorage.setItem('user', JSON.stringify(fresh));
      window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: fresh }));
      return fresh;
    } catch {
      return null;
    }
  };

  // Function to fetch fresh user data from database
  const fetchFreshUserData = async (userId: number): Promise<User | null> => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      return null;
    }
  };

  // Function to load and apply color preferences
  const loadAndApplyColorPreferences = async (userId: number) => {
    try {
      const response = await fetch(`/api/users/${userId}/color-preferences`);
      
      if (!response.ok) {
        // Apply default colors if no preferences exist
        applyThemeColors('#8b5cf6', false);
        applyTextColors('#111827', '#6b7280');
        try {
          localStorage.setItem('customColor', '#8b5cf6');
          localStorage.setItem('darkMode', 'false');
          localStorage.setItem('primaryTextColor', '#111827');
          localStorage.setItem('secondaryTextColor', '#6b7280');
        } catch {}
        setColorPreferencesApplied(true);
        return;
      }
      
      const colorPrefs = await response.json();
      
      if (!colorPrefs || (typeof colorPrefs === 'object' && Object.keys(colorPrefs).length === 0)) {
        // Apply default colors if preferences are empty
        applyThemeColors('#8b5cf6', false);
        applyTextColors('#111827', '#6b7280');
        try {
          localStorage.setItem('customColor', '#8b5cf6');
          localStorage.setItem('darkMode', 'false');
          localStorage.setItem('primaryTextColor', '#111827');
          localStorage.setItem('secondaryTextColor', '#6b7280');
        } catch {}
        setColorPreferencesApplied(true);
        return;
      }
      
      // Apply the color preferences
      if (colorPrefs.primaryColor) {
        applyThemeColors(colorPrefs.primaryColor, colorPrefs.isDarkMode || false);
      } else {
        applyThemeColors('#8b5cf6', false);
      }
      
      if (colorPrefs.primaryTextColor || colorPrefs.secondaryTextColor) {
        applyTextColors(
          colorPrefs.primaryTextColor || '#111827',
          colorPrefs.secondaryTextColor || '#6b7280'
        );
      } else {
        applyTextColors('#111827', '#6b7280');
      }
      
      // Persist loaded preferences for early initialization
      try {
        localStorage.setItem('customColor', colorPrefs.primaryColor || '#8b5cf6');
        localStorage.setItem('darkMode', (colorPrefs.isDarkMode || false).toString());
        localStorage.setItem('primaryTextColor', colorPrefs.primaryTextColor || '#111827');
        localStorage.setItem('secondaryTextColor', colorPrefs.secondaryTextColor || '#6b7280');
        if (colorPrefs.savedBrandColors) {
          localStorage.setItem('savedBrandColors', String(colorPrefs.savedBrandColors));
        }
        if (colorPrefs.savedTextColors) {
          localStorage.setItem('savedTextColors', String(colorPrefs.savedTextColors));
        }
      } catch {}
      
      setColorPreferencesApplied(true);
      
      // Dispatch event to notify components of color update
      window.dispatchEvent(new CustomEvent('colorPreferencesUpdated'));
      
    } catch (error) {
      // Apply default colors on error
      applyThemeColors('#8b5cf6', false);
      applyTextColors('#111827', '#6b7280');
      try {
        localStorage.setItem('customColor', '#8b5cf6');
        localStorage.setItem('darkMode', 'false');
        localStorage.setItem('primaryTextColor', '#111827');
        localStorage.setItem('secondaryTextColor', '#6b7280');
      } catch {}
      setColorPreferencesApplied(true);
    }
  };

  // Apply theme colors function
  const applyThemeColors = (primaryColor: string, isDark: boolean = false) => {
    const root = document.documentElement;
    
    // Convert hex to HSL for CSS custom properties
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    const hslColor = hexToHsl(primaryColor);
    
    // Apply CSS custom properties
    root.style.setProperty('--primary', hslColor, 'important');
    root.style.setProperty('--primary-foreground', isDark ? '210 40% 98%' : '222.2 84% 4.9%', 'important');
    root.style.setProperty('--accent', hslColor, 'important');
    root.style.setProperty('--ring', hslColor, 'important');
    
    // Apply dark/light mode styling
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Persist for early initialization
    try {
      localStorage.setItem('customColor', primaryColor);
      localStorage.setItem('darkMode', Boolean(isDark).toString());
    } catch {}
    
    console.log('Theme colors applied successfully');
  };

  // Apply text colors function
  const applyTextColors = (primaryTextColor: string, secondaryTextColor: string) => {
    const root = document.documentElement;
    
    // Convert hex to HSL for CSS custom properties
    const hexToHsl = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    };

    const primaryHsl = hexToHsl(primaryTextColor);
    const secondaryHsl = hexToHsl(secondaryTextColor);
    
    console.log('Setting text colors - Primary HSL:', primaryHsl, 'Secondary HSL:', secondaryHsl);
    
    // Apply text color CSS custom properties
    root.style.setProperty('--text-primary', primaryHsl, 'important');
    root.style.setProperty('--text-secondary', secondaryHsl, 'important');
    // Also sync Tailwind foreground variables so text color applies globally
    root.style.setProperty('--foreground', primaryHsl, 'important');
    root.style.setProperty('--muted-foreground', secondaryHsl, 'important');
    
    // Persist for early initialization
    try {
      localStorage.setItem('primaryTextColor', primaryTextColor);
      localStorage.setItem('secondaryTextColor', secondaryTextColor);
    } catch {}
    
    console.log('Text colors applied successfully');
  };

  // Add global event listeners for color refresh
  useEffect(() => {
    // Listen for color changes in settings
    const handleColorChange = (event: CustomEvent) => {
      if (event.detail && event.detail.type === 'colorChange') {
        const { primaryColor, textColor, textColorSecondary } = event.detail;
        
        if (primaryColor) {
          applyThemeColors(primaryColor, false);
        }
        
        if (textColor || textColorSecondary) {
          applyTextColors(
            textColor || '#111827',
            textColorSecondary || '#6b7280'
          );
        }
      }
    };

    window.addEventListener('colorChange', handleColorChange as EventListener);

    return () => {
      window.removeEventListener('colorChange', handleColorChange as EventListener);
    };
  }, []);

  // Initialize user from localStorage
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Check if we're on a public route (forms/:id) first
        const isPublicFormRoute = window.location.pathname.match(/^\/forms\/\d+$/);
        if (isPublicFormRoute) {
          setLoading(false);
          return;
        }

        // Check for stored user and token
        const storedUser = localStorage.getItem("user");
        const token = localStorage.getItem("token");

        if (!storedUser || !token) {
          // If we at least have a stored user, populate minimal state and try a best-effort refresh
          if (storedUser) {
            const userData: User = JSON.parse(storedUser);
            setUser(userData);
            setIsAuthenticated(true);
            // Best-effort refresh from server to sync any name/email changes
            await refreshUserFromServer(userData.id);
            await loadAndApplyColorPreferences(userData.id);
            setLoading(false);
            return;
          } else {
            setLoading(false);
            return;
          }
        }

        const userData: User = JSON.parse(storedUser);
        
        // Set initial state from localStorage immediately
        setUser(userData);
        setIsAuthenticated(true);

        try {
          // Prefer verify endpoint to ensure latest server-side user values (names, email, etc.)
          const verified = await refreshUserFromServer(userData.id);
          await loadAndApplyColorPreferences((verified || userData).id);
        } catch (error) {
          console.error('Error refreshing user:', error);
          await loadAndApplyColorPreferences(userData.id);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Light-weight sync: refresh user when window gains focus to keep header/menu in sync with settings
  useEffect(() => {
    const onFocus = () => {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const parsed: User = JSON.parse(storedUser);
        refreshUserFromServer(parsed.id);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Apply color preferences whenever user data changes
  useEffect(() => {
    // Check if we're on a public route (forms/:id)
    const isPublicFormRoute = window.location.pathname.match(/^\/forms\/\d+$/);
    
    // If we're on a public route, apply default colors immediately
    if (isPublicFormRoute && !colorPreferencesApplied) {
      applyThemeColors('#8b5cf6', false);
      applyTextColors('#111827', '#6b7280');
      setColorPreferencesApplied(true);
      return;
    }
    
    // Only apply user-specific colors if we have a user and we're not on a public route
    if (user && !colorPreferencesApplied && !isPublicFormRoute) {
      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        loadAndApplyColorPreferences(user.id);
      }, 100);
    }
  }, [user, colorPreferencesApplied]);

  const login = (userData: User, token?: string) => {
    setUser(userData);
    setIsAuthenticated(true);
    setColorPreferencesApplied(false);
    localStorage.setItem('user', JSON.stringify(userData));
    
    // Store JWT token if provided
    if (token) {
      localStorage.setItem('token', token);
    }
    
    // Also update profilePicture in localStorage for backward compatibility
    if (userData.profilePicture) {
      localStorage.setItem('profilePicture', userData.profilePicture);
    }
    
    // Dispatch event to notify all components of the login
    window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: userData }));
    
    // Apply color preferences
    loadAndApplyColorPreferences(userData.id);
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setColorPreferencesApplied(false);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('profilePicture');
    
    // Clear color preferences from the DOM
    const root = document.documentElement;
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-foreground');
    root.style.removeProperty('--accent');
    root.style.removeProperty('--ring');
    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-secondary');
    root.classList.remove('dark');
    
    // Force redirect to login page
    window.location.replace('/login');
  };

  const updateUser = (updatedUserData: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updatedUserData };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Also update profilePicture in localStorage for backward compatibility
      if (updatedUserData.profilePicture) {
        localStorage.setItem('profilePicture', updatedUserData.profilePicture);
      }
      
      // Dispatch event to notify all components of the user update
      window.dispatchEvent(new CustomEvent('userDataUpdated', { detail: updatedUser }));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        login,
        logout,
        updateUser,
        loading,
        colorPreferencesApplied,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
} 
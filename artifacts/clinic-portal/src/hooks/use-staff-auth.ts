import { useGetMe } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useCallback } from 'react';

export function useStaffAuth() {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem('staff_token');
  
  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: ['staff-me'],
      enabled: !!token,
      retry: false,
    }
  });

  const isAuthenticated = !!token && !error;

  const logout = useCallback(() => {
    localStorage.removeItem('staff_token');
    localStorage.removeItem('staff_refresh_token');
    setLocation('/login');
  }, [setLocation]);

  return {
    user,
    isLoading: !!token && isLoading,
    isAuthenticated,
    logout,
  };
}

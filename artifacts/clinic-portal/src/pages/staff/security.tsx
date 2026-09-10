import { useEffect, useState } from 'react';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { StaffLayout } from './dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { useToast } from '@/hooks/use-toast';

export default function StaffSecurity() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [phone, setPhone] = useState(user?.phone || '');

  useEffect(() => {
    if (user?.phone) setPhone(user.phone);
  }, [user?.phone]);

  const setMfa = async (enabled: boolean) => {
    setPending(true);
    try {
      const response = await fetch('/api/auth/me/mfa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, phone: phone.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Promena nije uspela');
      toast({ title: enabled ? 'SMS MFA je uključena' : 'SMS MFA je isključena' });
      window.location.reload();
    } catch (error) {
      toast({
        title: 'Promena nije uspela',
        description: error instanceof Error ? error.message : 'Pokušajte ponovo.',
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <StaffLayout title="Bezbednost naloga">
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                <ShieldCheck size={22} />
              </div>
              <div>
                <CardTitle>SMS verifikacija</CardTitle>
                <CardDescription>Dodatna zaštita za prijavu na portal.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="mfa-phone" className="text-sm font-medium">Broj telefona za MFA</label>
              <Input
                id="mfa-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+381641234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={pending}
              />
              <p className="text-xs text-gray-500">Kod za prijavu biće poslat SMS-om na ovaj broj.</p>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-gray-50 p-4">
              <Smartphone size={20} className="mt-0.5 text-primary" />
              <div className="text-sm">
                <p className="font-medium">{user?.mfaEnabled ? 'MFA je uključena' : 'MFA je isključena'}</p>
                <p className="text-gray-600 mt-1">
                  Kod za prijavu biće poslat SMS-om na broj telefona povezan sa nalogom.
                </p>
              </div>
            </div>
            <Button
              variant={user?.mfaEnabled ? 'outline' : 'default'}
              disabled={pending}
              onClick={() => setMfa(!user?.mfaEnabled)}
            >
              {pending ? 'Ažuriranje...' : user?.mfaEnabled ? 'Isključi SMS MFA' : 'Uključi SMS MFA'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}
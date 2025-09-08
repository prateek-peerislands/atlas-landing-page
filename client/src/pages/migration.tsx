import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Migration() {
  const [postgresUrl, setPostgresUrl] = useState('');
  const [mongoUri, setMongoUri] = useState('');
  const [prompt, setPrompt] = useState('Migrate table public.users to MongoDB db app, collection users');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [approved, setApproved] = useState(false);

  const onRun = async () => {
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch('/api/agent/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl, mongoUri, planId })
      });
      const data = await res.json();
      setAnswer(data.answer || data.message || JSON.stringify(data));
    } catch (e: any) {
      setAnswer(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onValidate = async () => {
    setValidating(true);
    setReport(null);
    setPlanId(null);
    setApproved(false);
    try {
      const res = await fetch('/api/agent/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl, mongoUri, instruction: prompt })
      });
      const data = await res.json();
      if (data.ok && data.planId) {
        setPlanId(data.planId);
        setReport(data.report || data);
      } else {
        setReport(data);
      }
    } catch (e: any) {
      setReport({ error: e.message });
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-bold mb-6">Database Migration Agent</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">PostgreSQL (source) connection string</label>
            <Input placeholder="postgres://user:pass@host:5432/db" value={postgresUrl} onChange={(e) => setPostgresUrl(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">MongoDB (destination) connection string</label>
            <Input placeholder="mongodb+srv://user:pass@cluster/db" value={mongoUri} onChange={(e) => setMongoUri(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Instruction</label>
            <Input placeholder="Describe what to migrate" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onValidate} disabled={validating || !postgresUrl || !mongoUri}>
              {validating ? 'Validating…' : 'Validate'}
            </Button>
            <Button onClick={onRun} disabled={loading || !postgresUrl || !mongoUri || !planId || !approved}>
              {loading ? 'Running…' : 'Proceed with migration'}
            </Button>
          </div>
          {planId && (
            <div className="flex items-center gap-2">
              <input id="approve" type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />
              <label htmlFor="approve" className="text-sm">I reviewed the validation report (plan {planId}) and approve proceeding</label>
            </div>
          )}
        </div>

        {report && (
          <div className="mt-8 p-4 border rounded bg-gray-50 whitespace-pre-wrap text-sm">
            <div className="font-semibold mb-2">Validation report</div>
            <pre>{JSON.stringify(report, null, 2)}</pre>
          </div>
        )}

        {answer && (
          <div className="mt-8 p-4 border rounded bg-gray-50 whitespace-pre-wrap text-sm">
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}



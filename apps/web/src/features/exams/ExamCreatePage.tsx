// Owner: Person A

import { createExam } from '@secure-exam/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { toast } from '@/components/ui/toast';
import { ExamForm } from './ExamForm';

export default function ExamCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <>
      <PageHeader
        eyebrow={
          <Link to="/admin/exams" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Exams
          </Link>
        }
        title="New exam"
        description="Starts as a draft. Add questions and register students, then publish."
      />
      <Card>
        <CardContent className="pt-5">
          <ExamForm
            submitLabel="Create draft"
            onCancel={() => navigate('/admin/exams')}
            onSubmit={async (data) => {
              const exam = await createExam(data);
              toast.success('Draft created');
              void queryClient.invalidateQueries({ queryKey: ['exams'] });
              navigate(`/admin/exams/${exam.id}`);
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

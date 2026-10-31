import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { owner } from '@/lib/auth';
import { db } from '@/lib/db';
import { Category } from '@/lib/models';
import { audit, sameOrigin, tooLarge } from '@/lib/security';
const schema = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), description: z.string().max(1000).optional(), image: z.string().url().optional().or(z.literal('')), displayOrder: z.number().int().min(0).max(999).default(0), published: z.boolean().default(true) });
export async function GET() { if (!await owner()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); try { await db(); const rows = await Category.find().sort({ displayOrder: 1, name: 1 }).lean(); return NextResponse.json(rows); } catch { return NextResponse.json({ error: 'Unable to load categories.' }, { status: 503 }); } }
export async function POST(req: NextRequest) { const admin = await owner(); if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); const oversized = tooLarge(req); if (oversized) return oversized; if (!sameOrigin(req)) return NextResponse.json({ error: 'Invalid request.' }, { status: 403 }); try { const d = schema.parse(await req.json()); await db(); const c = await Category.create(d); await audit(admin._id, 'category.create', 'Category', String(c._id)); return NextResponse.json({ id: c._id }, { status: 201 }); } catch { return NextResponse.json({ error: 'Unable to save category. Name and slug must be unique.' }, { status: 400 }); } }

import mongoose, { Schema } from 'mongoose';
import { DEFAULT_BUSINESS_WHATSAPP } from './whatsapp-number';

const common = { timestamps: true } as const;
const ProductSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 }, slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  category: { type: String, required: true, trim: true }, description: { type: String, required: true, maxlength: 2000 }, shortDescription: { type: String, maxlength: 300 }, fullDescription: { type: String, maxlength: 8000 },
  image: String, images: { type: [String], default: [] }, specifications: { type: Schema.Types.Mixed, default: {} }, grade: String, unit: { type: String, default: 'kg' }, minOrderQuantity: { type: Number, min: 0 },
  status: { type: String, enum: ['available', 'seasonal', 'unavailable'], default: 'seasonal' }, published: { type: Boolean, default: false }, featured: { type: Boolean, default: false },
  seoTitle: String, seoDescription: String, archivedAt: Date,
}, common);
ProductSchema.index({ published: 1, category: 1, featured: -1 });
export const Product = mongoose.models.Product ?? mongoose.model('Product', ProductSchema);

const CategorySchema = new Schema({ name: { type: String, required: true, unique: true, trim: true }, slug: { type: String, required: true, unique: true, lowercase: true }, description: { type: String, maxlength: 1000 }, image: String, displayOrder: { type: Number, default: 0 }, published: { type: Boolean, default: true } }, common);
export const Category = mongoose.models.Category ?? mongoose.model('Category', CategorySchema);

const CustomerSchema = new Schema({ name: { type: String, required: true }, phone: { type: String, required: true, unique: true, index: true }, email: String, company: String, type: String }, common);
export const Customer = mongoose.models.Customer ?? mongoose.model('Customer', CustomerSchema);

const EnquirySchema = new Schema({
  reference: { type: String, required: true, unique: true, index: true }, customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true }, customerSnapshot: Schema.Types.Mixed,
  idempotencyKey: { type: String, select: false },
  enquiryType: { type: String, enum: ['Quotation', 'Business', 'Contact'], default: 'Quotation' }, items: [{ productId: Schema.Types.ObjectId, snapshot: Schema.Types.Mixed, quantity: { type: Number, min: 0.01, required: true }, unit: String }],
  destination: Schema.Types.Mixed, subject: { type: String, maxlength: 160 }, message: { type: String, maxlength: 4000 }, contactConsent: { type: Boolean, default: false }, consentedAt: Date, status: { type: String, default: 'New', enum: ['New', 'Contacted', 'Quotation Sent', 'Accepted', 'Processing', 'Dispatched', 'Completed', 'Rejected', 'Cancelled'] },
  notes: { type: String, maxlength: 6000 }, statusHistory: [{ status: String, at: Date, actor: Schema.Types.ObjectId }], notificationStatus: { type: String, default: 'pending', enum: ['pending', 'sent', 'failed', 'disabled'] }, notificationId: String,
  acknowledgementStatus: { type: String, default: 'pending', enum: ['pending', 'sent', 'failed', 'disabled'] }, acknowledgementId: String,
  quotation: { lines: [{ productName: String, quantity: Number, unit: String, unitPrice: Number }], transport: { type: Number, default: 0 }, additionalCharges: { type: Number, default: 0 }, total: Number, notes: String, terms: String, validUntil: Date, sentAt: Date, emailId: String },
  quotationHistory: { type: [Schema.Types.Mixed], default: [] },
  statusNotificationHistory: { type: [Schema.Types.Mixed], default: [] },
}, common);
EnquirySchema.index({ status: 1, createdAt: -1 });
EnquirySchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
export const Enquiry = mongoose.models.Enquiry ?? mongoose.model('Enquiry', EnquirySchema);

const SupplierSchema = new Schema({ name: { type: String, required: true }, phone: { type: String, required: true }, email: String, idempotencyKey: { type: String, select: false }, notificationStatus: { type: String, default: 'pending', enum: ['pending', 'sent', 'failed', 'disabled'] }, notificationId: String, product: { type: String, required: true }, location: { type: String, required: true }, quantity: String, period: String, description: String, status: { type: String, enum: ['New', 'Contacted', 'Reviewing', 'Approved', 'Declined'], default: 'New' }, notes: String }, common);
SupplierSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
export const SupplierEnquiry = mongoose.models.SupplierEnquiry ?? mongoose.model('SupplierEnquiry', SupplierSchema);

export const Admin = mongoose.models.Admin ?? mongoose.model('Admin', new Schema({ ownerKey: { type: String, required: true, default: 'primary', enum: ['primary'], unique: true, immutable: true }, email: { type: String, required: true, unique: true, lowercase: true }, passwordHash: { type: String, required: true, select: false }, active: { type: Boolean, default: true } }, common));
export const Session = mongoose.models.Session ?? mongoose.model('Session', new Schema({ tokenHash: { type: String, required: true, unique: true }, admin: { type: Schema.Types.ObjectId, ref: 'Admin', required: true }, expiresAt: { type: Date, required: true, expires: 0 } }, common));
export const RateLimit = mongoose.models.RateLimit ?? mongoose.model('RateLimit', new Schema({ _id: String, count: { type: Number, default: 0 }, expiresAt: { type: Date, required: true, expires: 0 } }, { versionKey: false }));
export const SiteSettings = mongoose.models.SiteSettings ?? mongoose.model('SiteSettings', new Schema({
  key: { type: String, default: 'main', unique: true }, businessName: { type: String, default: 'Hanumanji Agro' }, location: { type: String, default: 'Kalimpong, Northeast India' },
  email: { type: String, default: 'hanumanjiagro@gmail.com' }, phone: { type: String, default: '+91 7001102168' }, whatsapp: { type: String, default: DEFAULT_BUSINESS_WHATSAPP },
  notificationEmail: { type: String, default: 'hanumanjiagro@gmail.com' }, notificationPreferences: { type: Schema.Types.Mixed, default: { ownerEmail: true, customerAcknowledgement: false, orderStatus: false } },
  social: { type: Schema.Types.Mixed, default: {} }, description: String, logo: String,
}, common));
export const AuditLog = mongoose.models.AuditLog ?? mongoose.model('AuditLog', new Schema({ actor: Schema.Types.ObjectId, action: String, entity: String, entityId: String, metadata: Schema.Types.Mixed, at: { type: Date, default: Date.now } }, common));

"use client";

import {
	AddressBook,
	CalendarBlank,
	ChartLineUp,
	Clock,
	CreditCard,
	Files,
	FileText,
	Handshake,
	type Icon,
	Invoice,
	Package,
	PackageIcon,
	PenNib,
	ShoppingCart,
	Storefront,
	Truck,
} from "@phosphor-icons/react";

const ICONS: Readonly<Record<string, Icon>> = {
	"client-records": AddressBook,
	invoicing: Invoice,
	payments: CreditCard,
	fulfillment: Handshake,
	files: Files,
	"products-services": Storefront,
	orders: ShoppingCart,
	inventory: PackageIcon,
	shipping: Truck,
	bookings: CalendarBlank,
	"projects-tasks": FileText,
	"time-tracking": Clock,
	"quotes-estimates": Package,
	"contracts-esign": PenNib,
	"reporting-analytics": ChartLineUp,
};

export function ModuleIcon({
	id,
	className,
}: {
	id: string;
	className?: string;
}) {
	const IconComponent = ICONS[id];
	return IconComponent ? <IconComponent className={className} /> : null;
}

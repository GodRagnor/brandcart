"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = {
  product_id: string;
  title: string;
  image: string;
  price: number;
  mrp?: number;
  qty: number;
  seller_id: string;
};

type CartContextType = {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (product_id: string) => void;
  updateQty: (product_id: string, qty: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("cart");
    if (saved) setItems(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(items));
  }, [items]);

  const addToCart = (item: CartItem) => {
    setItems(prev => {
      const existing = prev.find(p => p.product_id === item.product_id);
      if (existing) {
        return prev.map(p =>
          p.product_id === item.product_id
            ? { ...p, qty: p.qty + item.qty }
            : p
        );
      }
      return [...prev, item];
    });
  };

  const removeFromCart = (product_id: string) => {
    setItems(prev => prev.filter(p => p.product_id !== product_id));
  };

  const updateQty = (product_id: string, qty: number) => {
    if (qty <= 0) return;
    setItems(prev =>
      prev.map(p =>
        p.product_id === product_id ? { ...p, qty } : p
      )
    );
  };

  const clearCart = () => setItems([]);

  return (
    <CartContext.Provider
      value={{ items, addToCart, removeFromCart, updateQty, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

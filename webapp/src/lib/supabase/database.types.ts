export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          changes: Json
          id: number
          occurred_at: string
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role: string
          changes?: Json
          id?: never
          occurred_at?: string
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          changes?: Json
          id?: never
          occurred_at?: string
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_path: string | null
          is_active: boolean
          name: string
          position: number
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name: string
          position?: number
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_path?: string | null
          is_active?: boolean
          name?: string
          position?: number
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_translations: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          locale: string
          name: string
          slug: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          locale: string
          name: string
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          locale?: string
          name?: string
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_translations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "category_translations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          address_type: string
          city: string
          company: string | null
          country_code: string
          created_at: string
          first_name: string
          id: string
          is_default: boolean
          label: string | null
          last_name: string
          phone: string | null
          postal_code: string | null
          region: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          address_type?: string
          city: string
          company?: string | null
          country_code: string
          created_at?: string
          first_name: string
          id?: string
          is_default?: boolean
          label?: string | null
          last_name: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          address_type?: string
          city?: string
          company?: string | null
          country_code?: string
          created_at?: string
          first_name?: string
          id?: string
          is_default?: boolean
          label?: string | null
          last_name?: string
          phone?: string | null
          postal_code?: string | null
          region?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_settings: {
        Row: {
          allow_custom_amount: boolean
          allow_scheduled_delivery: boolean
          currency: string
          default_design: string
          enabled_designs: string[]
          expiry_months: number | null
          id: boolean
          is_published: boolean
          max_amount: number
          message_max_length: number
          message_mode: string
          min_amount: number
          preset_amounts: number[]
          product_id: string | null
          recipient_name_mode: string
          sender_name_mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_custom_amount?: boolean
          allow_scheduled_delivery?: boolean
          currency?: string
          default_design?: string
          enabled_designs?: string[]
          expiry_months?: number | null
          id?: boolean
          is_published?: boolean
          max_amount?: number
          message_max_length?: number
          message_mode?: string
          min_amount?: number
          preset_amounts?: number[]
          product_id?: string | null
          recipient_name_mode?: string
          sender_name_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_custom_amount?: boolean
          allow_scheduled_delivery?: boolean
          currency?: string
          default_design?: string
          enabled_designs?: string[]
          expiry_months?: number | null
          id?: boolean
          is_published?: boolean
          max_amount?: number
          message_max_length?: number
          message_mode?: string
          min_amount?: number
          preset_amounts?: number[]
          product_id?: string | null
          recipient_name_mode?: string
          sender_name_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          actor_id: string | null
          amount: number
          balance_after: number
          created_at: string
          gift_card_id: string
          id: number
          kind: string
          note: string | null
          order_id: string | null
        }
        Insert: {
          actor_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          gift_card_id: string
          id?: never
          kind: string
          note?: string | null
          order_id?: string | null
        }
        Update: {
          actor_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          gift_card_id?: string
          id?: never
          kind?: string
          note?: string | null
          order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_card_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance: number
          cancelled_at: string | null
          code: string
          code_last4: string | null
          created_at: string
          currency: string
          deliver_at: string | null
          delivered_at: string | null
          delivery_status: string
          design: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_at: string | null
          message: string | null
          order_id: string | null
          order_item_id: string | null
          purchaser_email: string | null
          purchaser_user_id: string | null
          recipient_email: string
          recipient_name: string | null
          sender_name: string | null
          source: string
          state: string
          updated_at: string
        }
        Insert: {
          balance?: number
          cancelled_at?: string | null
          code: string
          code_last4?: string | null
          created_at?: string
          currency: string
          deliver_at?: string | null
          delivered_at?: string | null
          delivery_status?: string
          design?: string
          expires_at?: string | null
          id?: string
          initial_amount: number
          issued_at?: string | null
          message?: string | null
          order_id?: string | null
          order_item_id?: string | null
          purchaser_email?: string | null
          purchaser_user_id?: string | null
          recipient_email: string
          recipient_name?: string | null
          sender_name?: string | null
          source?: string
          state?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          cancelled_at?: string | null
          code?: string
          code_last4?: string | null
          created_at?: string
          currency?: string
          deliver_at?: string | null
          delivered_at?: string | null
          delivery_status?: string
          design?: string
          expires_at?: string | null
          id?: string
          initial_amount?: number
          issued_at?: string | null
          message?: string | null
          order_id?: string | null
          order_item_id?: string | null
          purchaser_email?: string | null
          purchaser_user_id?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sender_name?: string | null
          source?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_purchaser_user_id_fkey"
            columns: ["purchaser_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          availability: string
          created_at: string
          id: string
          low_stock_threshold: number
          product_id: string | null
          quantity_on_hand: number
          quantity_reserved: number
          stock_status: string | null
          track_inventory: boolean
          updated_at: string
          updated_by: string | null
          variant_id: string | null
        }
        Insert: {
          availability?: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          product_id?: string | null
          quantity_on_hand?: number
          quantity_reserved?: number
          stock_status?: string | null
          track_inventory?: boolean
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Update: {
          availability?: string
          created_at?: string
          id?: string
          low_stock_threshold?: number
          product_id?: string | null
          quantity_on_hand?: number
          quantity_reserved?: number
          stock_status?: string | null
          track_inventory?: boolean
          updated_at?: string
          updated_by?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_id: string | null
          created_at: string
          id: number
          inventory_item_id: string
          movement_type: string
          on_hand_after: number
          on_hand_delta: number
          order_id: string | null
          reserved_after: number
          reserved_delta: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: never
          inventory_item_id: string
          movement_type: string
          on_hand_after: number
          on_hand_delta: number
          order_id?: string | null
          reserved_after: number
          reserved_delta: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: never
          inventory_item_id?: string
          movement_type?: string
          on_hand_after?: number
          on_hand_delta?: number
          order_id?: string | null
          reserved_after?: number
          reserved_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      languages: {
        Row: {
          code: string
          created_at: string
          is_default: boolean
          is_enabled: boolean
          locale: string
          name: string
          native_name: string
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_default?: boolean
          is_enabled?: boolean
          locale: string
          name: string
          native_name: string
          position?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_default?: boolean
          is_enabled?: boolean
          locale?: string
          name?: string
          native_name?: string
          position?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string | null
          order_id: string
          product_id: string | null
          product_name: string
          quantity: number
          sku: string | null
          subtotal_amount: number | null
          tax_amount: number
          tax_rate_bp: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          quantity: number
          sku?: string | null
          subtotal_amount?: number | null
          tax_amount?: number
          tax_rate_bp?: number
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          subtotal_amount?: number | null
          tax_amount?: number
          tax_rate_bp?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_note: string | null
          amount_due: number | null
          billing_address: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_note: string | null
          discount_amount: number
          expires_at: string | null
          fulfillment_status: string
          gift_card_amount: number
          id: string
          locale: string
          order_number: string
          paid_at: string | null
          payment_status: string
          prices_include_tax: boolean
          shipping_address: Json | null
          shipping_amount: number
          shipping_method_name: string | null
          shipping_rate_id: string | null
          status: string
          stock_state: string
          subtotal_amount: number
          tax_amount: number
          tax_country_code: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_due?: number | null
          billing_address: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency: string
          customer_email: string
          customer_note?: string | null
          discount_amount?: number
          expires_at?: string | null
          fulfillment_status?: string
          gift_card_amount?: number
          id?: string
          locale?: string
          order_number?: string
          paid_at?: string | null
          payment_status?: string
          prices_include_tax?: boolean
          shipping_address?: Json | null
          shipping_amount?: number
          shipping_method_name?: string | null
          shipping_rate_id?: string | null
          status?: string
          stock_state?: string
          subtotal_amount: number
          tax_amount?: number
          tax_country_code?: string | null
          total_amount: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_due?: number | null
          billing_address?: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          currency?: string
          customer_email?: string
          customer_note?: string | null
          discount_amount?: number
          expires_at?: string | null
          fulfillment_status?: string
          gift_card_amount?: number
          id?: string
          locale?: string
          order_number?: string
          paid_at?: string | null
          payment_status?: string
          prices_include_tax?: boolean
          shipping_address?: Json | null
          shipping_amount?: number
          shipping_method_name?: string | null
          shipping_rate_id?: string | null
          status?: string
          stock_state?: string
          subtotal_amount?: number
          tax_amount?: number
          tax_country_code?: string | null
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "orders_shipping_rate_id_fkey"
            columns: ["shipping_rate_id"]
            isOneToOne: false
            referencedRelation: "shipping_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          amount_refunded: number
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          gift_card_id: string | null
          id: string
          order_id: string
          payment_method_type: string | null
          provider: string
          provider_checkout_id: string | null
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          amount_refunded?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency: string
          failure_reason?: string | null
          gift_card_id?: string | null
          id?: string
          order_id: string
          payment_method_type?: string | null
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_refunded?: number
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          gift_card_id?: string | null
          id?: string
          order_id?: string
          payment_method_type?: string | null
          provider?: string
          provider_checkout_id?: string | null
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_card_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          media_type: string
          position: number
          product_id: string
          storage_path: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          position?: number
          product_id: string
          storage_path: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          media_type?: string
          position?: number
          product_id?: string
          storage_path?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_media_translations: {
        Row: {
          alt_text: string
          created_at: string
          locale: string
          media_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alt_text: string
          created_at?: string
          locale: string
          media_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alt_text?: string
          created_at?: string
          locale?: string
          media_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_media_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_media_translations_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "product_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_media_translations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_translations: {
        Row: {
          created_at: string
          description: string | null
          locale: string
          meta_description: string | null
          meta_title: string | null
          name: string
          product_id: string
          short_description: string | null
          slug: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          locale: string
          meta_description?: string | null
          meta_title?: string | null
          name: string
          product_id: string
          short_description?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          locale?: string
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          product_id?: string
          short_description?: string | null
          slug?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_translations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_translations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variant_translations: {
        Row: {
          created_at: string
          locale: string
          name: string
          status: string
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          locale: string
          name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          locale?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variant_translations_locale_fkey"
            columns: ["locale"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "product_variant_translations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variant_translations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          position: number
          price: number | null
          product_id: string
          sku: string | null
          updated_at: string
          updated_by: string | null
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          position?: number
          price?: number | null
          product_id: string
          sku?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          position?: number
          price?: number | null
          product_id?: string
          sku?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_featured: boolean
          meta_description: string | null
          meta_title: string | null
          metadata: Json
          name: string
          price: number
          product_type: string
          short_description: string | null
          sku: string | null
          slug: string
          status: string
          tax_category: string
          updated_at: string
          updated_by: string | null
          weight_grams: number | null
        }
        Insert: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          meta_description?: string | null
          meta_title?: string | null
          metadata?: Json
          name: string
          price: number
          product_type?: string
          short_description?: string | null
          sku?: string | null
          slug: string
          status?: string
          tax_category?: string
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Update: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_featured?: boolean
          meta_description?: string | null
          meta_title?: string | null
          metadata?: Json
          name?: string
          price?: number
          product_type?: string
          short_description?: string | null
          sku?: string | null
          slug?: string
          status?: string
          tax_category?: string
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
        ]
      }
      refund_items: {
        Row: {
          order_item_id: string
          quantity: number
          refund_id: string
        }
        Insert: {
          order_item_id: string
          quantity: number
          refund_id: string
        }
        Update: {
          order_item_id?: string
          quantity?: number
          refund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_items_refund_id_fkey"
            columns: ["refund_id"]
            isOneToOne: false
            referencedRelation: "refunds"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          restock: boolean
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          failure_reason?: string | null
          id?: string
          order_id: string
          payment_id: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason: string
          requested_by?: string | null
          restock?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          order_id?: string
          payment_id?: string
          processed_at?: string | null
          provider_refund_id?: string | null
          reason?: string
          requested_by?: string | null
          restock?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_helpful_votes: {
        Row: {
          created_at: string
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_helpful_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          review_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          review_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          review_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_notes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_photos: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          position: number
          review_id: string
          storage_path: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          position?: number
          review_id: string
          storage_path: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          position?: number
          review_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_photos_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          review_id: string
          source: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id: string
          source?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          review_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_reports_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string
          body: string
          changes_request: string | null
          created_at: string
          edited_at: string | null
          helpful_count: number
          id: string
          is_flagged: boolean
          is_verified: boolean | null
          language: string
          order_id: string | null
          product_id: string | null
          published_at: string | null
          rating: number
          rejection_reason: string | null
          response_at: string | null
          response_body: string | null
          response_by: string | null
          status: string
          submitted_at: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name: string
          body: string
          changes_request?: string | null
          created_at?: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_flagged?: boolean
          is_verified?: boolean | null
          language: string
          order_id?: string | null
          product_id?: string | null
          published_at?: string | null
          rating: number
          rejection_reason?: string | null
          response_at?: string | null
          response_body?: string | null
          response_by?: string | null
          status?: string
          submitted_at?: string
          tags?: string[]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string
          body?: string
          changes_request?: string | null
          created_at?: string
          edited_at?: string | null
          helpful_count?: number
          id?: string
          is_flagged?: boolean
          is_verified?: boolean | null
          language?: string
          order_id?: string | null
          product_id?: string | null
          published_at?: string | null
          rating?: number
          rejection_reason?: string | null
          response_at?: string | null
          response_body?: string | null
          response_by?: string | null
          status?: string
          submitted_at?: string
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_language_fkey"
            columns: ["language"]
            isOneToOne: false
            referencedRelation: "languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_response_by_fkey"
            columns: ["response_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          is_staff: boolean
          key: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_staff?: boolean
          key: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_staff?: boolean
          key?: string
          name?: string
        }
        Relationships: []
      }
      shipment_items: {
        Row: {
          order_item_id: string
          quantity: number
          shipment_id: string
        }
        Insert: {
          order_item_id: string
          quantity: number
          shipment_id: string
        }
        Update: {
          order_item_id?: string
          quantity?: number
          shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          estimated_delivery: string | null
          id: string
          order_id: string
          service: string | null
          shipped_at: string | null
          status: string
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id: string
          service?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          carrier?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          estimated_delivery?: string | null
          id?: string
          order_id?: string
          service?: string | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_rates: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          free_over_amount: number | null
          id: string
          is_active: boolean
          kind: string
          max_days: number
          max_order_amount: number | null
          max_weight_grams: number | null
          min_days: number
          min_order_amount: number | null
          min_weight_grams: number | null
          name: string
          position: number
          price: number
          updated_at: string
          updated_by: string | null
          zone_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          free_over_amount?: number | null
          id?: string
          is_active?: boolean
          kind: string
          max_days: number
          max_order_amount?: number | null
          max_weight_grams?: number | null
          min_days: number
          min_order_amount?: number | null
          min_weight_grams?: number | null
          name: string
          position?: number
          price: number
          updated_at?: string
          updated_by?: string | null
          zone_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          free_over_amount?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          max_days?: number
          max_order_amount?: number | null
          max_weight_grams?: number | null
          min_days?: number
          min_order_amount?: number | null
          min_weight_grams?: number | null
          name?: string
          position?: number
          price?: number
          updated_at?: string
          updated_by?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zone_countries: {
        Row: {
          country_code: string
          created_at: string
          zone_id: string
        }
        Insert: {
          country_code: string
          created_at?: string
          zone_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zone_countries_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          is_rest_of_world: boolean
          name: string
          position: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_rest_of_world?: boolean
          name: string
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          is_rest_of_world?: boolean
          name?: string
          position?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_zones_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          attempts: number
          error: string | null
          id: string
          livemode: boolean
          object_id: string | null
          order_id: string | null
          processed_at: string | null
          received_at: string
          status: string
          type: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          id: string
          livemode?: boolean
          object_id?: string | null
          order_id?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          type: string
        }
        Update: {
          attempts?: number
          error?: string | null
          id?: string
          livemode?: boolean
          object_id?: string | null
          order_id?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          rate_bp: number
          tax_category: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rate_bp: number
          tax_category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          rate_bp?: number
          tax_category?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      gift_card_overview: {
        Row: {
          balance: number | null
          cancelled_at: string | null
          code_last4: string | null
          created_at: string | null
          currency: string | null
          deliver_at: string | null
          delivery_status: string | null
          design: string | null
          display_status: string | null
          expires_at: string | null
          id: string | null
          initial_amount: number | null
          issued_at: string | null
          order_id: string | null
          purchaser_email: string | null
          purchaser_user_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          sender_name: string | null
          source: string | null
        }
        Insert: {
          balance?: number | null
          cancelled_at?: string | null
          code_last4?: string | null
          created_at?: string | null
          currency?: string | null
          deliver_at?: string | null
          delivery_status?: string | null
          design?: string | null
          display_status?: never
          expires_at?: string | null
          id?: string | null
          initial_amount?: number | null
          issued_at?: string | null
          order_id?: string | null
          purchaser_email?: string | null
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          source?: string | null
        }
        Update: {
          balance?: number | null
          cancelled_at?: string | null
          code_last4?: string | null
          created_at?: string | null
          currency?: string | null
          deliver_at?: string | null
          delivery_status?: string | null
          design?: string | null
          display_status?: never
          expires_at?: string | null
          id?: string | null
          initial_amount?: number | null
          issued_at?: string | null
          order_id?: string | null
          purchaser_email?: string | null
          purchaser_user_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_purchaser_user_id_fkey"
            columns: ["purchaser_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_review_stats: {
        Row: {
          average_rating: number | null
          five_star: number | null
          four_star: number | null
          one_star: number | null
          product_id: string | null
          review_count: number | null
          three_star: number | null
          two_star: number | null
          verified_count: number | null
          with_photos_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_gift_card: {
        Args: { p_delta: number; p_gift_card_id: string; p_note: string }
        Returns: {
          actor_id: string | null
          amount: number
          balance_after: number
          created_at: string
          gift_card_id: string
          id: number
          kind: string
          note: string | null
          order_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "gift_card_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_gift_card: {
        Args: { p_gift_card_id: string; p_note: string }
        Returns: {
          balance: number
          cancelled_at: string | null
          code: string
          code_last4: string | null
          created_at: string
          currency: string
          deliver_at: string | null
          delivered_at: string | null
          delivery_status: string
          design: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_at: string | null
          message: string | null
          order_id: string | null
          order_item_id: string | null
          purchaser_email: string | null
          purchaser_user_id: string | null
          recipient_email: string
          recipient_name: string | null
          sender_name: string | null
          source: string
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: {
          admin_note: string | null
          amount_due: number | null
          billing_address: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_note: string | null
          discount_amount: number
          expires_at: string | null
          fulfillment_status: string
          gift_card_amount: number
          id: string
          locale: string
          order_number: string
          paid_at: string | null
          payment_status: string
          prices_include_tax: boolean
          shipping_address: Json | null
          shipping_amount: number
          shipping_method_name: string | null
          shipping_rate_id: string | null
          status: string
          stock_state: string
          subtotal_amount: number
          tax_amount: number
          tax_country_code: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_inventory: {
        Args: { p_inventory_item_id: string; p_quantity: number }
        Returns: {
          availability: string
          created_at: string
          id: string
          low_stock_threshold: number
          product_id: string | null
          quantity_on_hand: number
          quantity_reserved: number
          stock_status: string | null
          track_inventory: boolean
          updated_at: string
          updated_by: string | null
          variant_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_billing_address: Json
          p_currency?: string
          p_customer_email: string
          p_customer_note?: string
          p_gift_card_codes?: string[]
          p_items: Json
          p_locale?: string
          p_reservation_minutes?: number
          p_shipping_address?: Json
          p_shipping_rate_id?: string
          p_user_id: string
        }
        Returns: {
          admin_note: string | null
          amount_due: number | null
          billing_address: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_note: string | null
          discount_amount: number
          expires_at: string | null
          fulfillment_status: string
          gift_card_amount: number
          id: string
          locale: string
          order_number: string
          paid_at: string | null
          payment_status: string
          prices_include_tax: boolean
          shipping_address: Json | null
          shipping_amount: number
          shipping_method_name: string | null
          shipping_rate_id: string | null
          status: string
          stock_state: string
          subtotal_amount: number
          tax_amount: number
          tax_country_code: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_stale_orders: { Args: never; Returns: number }
      extend_gift_card: {
        Args: { p_expires_at: string; p_gift_card_id: string; p_note?: string }
        Returns: {
          balance: number
          cancelled_at: string | null
          code: string
          code_last4: string | null
          created_at: string
          currency: string
          deliver_at: string | null
          delivered_at: string | null
          delivery_status: string
          design: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_at: string | null
          message: string | null
          order_id: string | null
          order_item_id: string | null
          purchaser_email: string | null
          purchaser_user_id: string | null
          recipient_email: string
          recipient_name: string | null
          sender_name: string | null
          source: string
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gift_card_balance: {
        Args: { p_code: string }
        Returns: {
          balance: number
          code_last4: string
          currency: string
          expires_at: string
          redeemable: boolean
        }[]
      }
      gift_card_code_for_delivery: {
        Args: { p_gift_card_id: string }
        Returns: string
      }
      issue_gift_card: {
        Args: {
          p_amount: number
          p_expires_at?: string
          p_message?: string
          p_note?: string
          p_recipient_email: string
          p_recipient_name?: string
        }
        Returns: string
      }
      mark_order_paid: {
        Args: {
          p_amount: number
          p_card_brand?: string
          p_card_last4?: string
          p_currency: string
          p_order_id: string
          p_payment_method_type?: string
          p_provider_checkout_id?: string
          p_provider_payment_id?: string
        }
        Returns: {
          admin_note: string | null
          amount_due: number | null
          billing_address: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          currency: string
          customer_email: string
          customer_note: string | null
          discount_amount: number
          expires_at: string | null
          fulfillment_status: string
          gift_card_amount: number
          id: string
          locale: string
          order_number: string
          paid_at: string | null
          payment_status: string
          prices_include_tax: boolean
          shipping_address: Json | null
          shipping_amount: number
          shipping_method_name: string | null
          shipping_rate_id: string | null
          status: string
          stock_state: string
          subtotal_amount: number
          tax_amount: number
          tax_country_code: string | null
          total_amount: number
          updated_at: string
          updated_by: string | null
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_refund_failed: {
        Args: { p_reason?: string; p_refund_id: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          restock: boolean
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_refund_succeeded: {
        Args: { p_provider_refund_id?: string; p_refund_id: string }
        Returns: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          restock: boolean
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_gift_card_delivery: {
        Args: { p_gift_card_id: string; p_new_email?: string; p_status: string }
        Returns: {
          balance: number
          cancelled_at: string | null
          code: string
          code_last4: string | null
          created_at: string
          currency: string
          deliver_at: string | null
          delivered_at: string | null
          delivery_status: string
          design: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_at: string | null
          message: string | null
          order_id: string | null
          order_item_id: string | null
          purchaser_email: string | null
          purchaser_user_id: string | null
          recipient_email: string
          recipient_name: string | null
          sender_name: string | null
          source: string
          state: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_to_gift_cards: {
        Args: { p_amount: number; p_order_id: string; p_reason: string }
        Returns: number
      }
      request_refund: {
        Args: {
          p_amount: number
          p_items?: Json
          p_order_id: string
          p_reason: string
          p_restock?: boolean
        }
        Returns: {
          amount: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          order_id: string
          payment_id: string
          processed_at: string | null
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          restock: boolean
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shipping_zone_for_country: {
        Args: { p_country_code: string }
        Returns: string
      }
      vat_included: {
        Args: { p_amount: number; p_rate_bp: number }
        Returns: number
      }
      vat_rate_bp: {
        Args: { p_country_code: string; p_tax_category?: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

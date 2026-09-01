<?php
/**
 * Plugin Name: The Nest Category Taxonomy Compatibility
 * Description: Adds the two-level Category -> Sub-category contract used by The Nest app to MyNest Unified Marketplace.
 * Version: 1.0.0
 * Requires Plugins: woocommerce, mynest-unified-marketplace
 * Requires PHP: 8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class MNU_Category_Taxonomy_Compat {
    private const VERSION = '2.0.0';
    private const VERSION_OPTION = 'mnu_category_taxonomy_compat_version';
    private const APPLICATION_META = '_mnu_application_category_selections';

    public static function boot(): void {
        add_action( 'init', array( __CLASS__, 'maybe_seed_taxonomy' ), 40 );
        add_filter( 'rest_pre_dispatch', array( __CLASS__, 'validate_and_normalize_requests' ), 20, 3 );
        add_filter( 'rest_request_after_callbacks', array( __CLASS__, 'persist_application_categories' ), 20, 3 );
        add_filter( 'rest_post_dispatch', array( __CLASS__, 'enrich_responses' ), 20, 3 );
    }

    public static function maybe_seed_taxonomy(): void {
        if ( ! taxonomy_exists( 'product_cat' ) || get_option( self::VERSION_OPTION ) === self::VERSION ) {
            return;
        }

        foreach ( self::taxonomy_definition() as $root_slug => $definition ) {
            $parent_id = self::ensure_term( $definition['name'], $root_slug, 0 );
            if ( ! $parent_id ) {
                continue;
            }
            foreach ( $definition['children'] as $child_name ) {
                self::ensure_term( $child_name, $root_slug . '-' . sanitize_title( $child_name ), $parent_id );
            }
        }

        update_option( self::VERSION_OPTION, self::VERSION, false );
    }

    /**
     * Two-level taxonomy used by the ShopMyNest app and admin console.
     *
     * v2.0.0 (2026-09-01): expanded from a handmade/craft-only taxonomy to a
     * general e-commerce hierarchy. The previous craft roots (Sewing,
     * Jewelry, Woodworking, Art, Paper & Stationery, Knitting & Crochet,
     * Candles & Home Fragrance, Bath & Body, Craft Supplies, Digital
     * Products) are consolidated under a single 'Handmade & Crafts' root
     * to reduce top-level clutter; their old slugs still exist as terms so
     * historical products stay valid, and re-seeding will only add new
     * terms, never delete anything. Roots kept as-is: Accessories,
     * Baby & Kids, Pet Supplies, Toys & Games, Seasonal & Holiday,
     * Personalized Gifts, Home & Living.
     */
    private static function taxonomy_definition(): array {
        return array(
            // --- General commerce roots ---
            'electronics' => array(
                'name' => 'Electronics',
                'children' => array( 'Phones & Accessories', 'Laptops & Computers', 'Tablets & E-Readers', 'TVs & Home Theater', 'Audio & Headphones', 'Cameras & Photography', 'Wearables & Smartwatches', 'Gaming Consoles', 'Smart Home', 'Cables & Chargers', 'Other Electronics' ),
            ),
            'apparel' => array(
                'name' => 'Clothing & Apparel',
                'children' => array( "Women's Clothing", "Men's Clothing", "Girls' Clothing", "Boys' Clothing", 'Shoes', 'Activewear', 'Swimwear', 'Sleepwear', 'Underwear & Socks', 'Coats & Outerwear', 'Uniforms & Workwear', 'Other Apparel' ),
            ),
            'jewelry-watches' => array(
                'name' => 'Jewelry & Watches',
                'children' => array( 'Necklaces', 'Earrings', 'Bracelets', 'Rings', 'Watches', 'Fine Jewelry', 'Body Jewelry', "Men's Jewelry", 'Jewelry Boxes & Care', 'Other Jewelry' ),
            ),
            'home-living' => array(
                'name' => 'Home & Living',
                'children' => array( 'Décor', 'Furniture', 'Kitchen & Dining', 'Bath', 'Bedding', 'Storage & Organization', 'Lighting', 'Rugs & Carpets', 'Outdoor & Garden', 'Curtains & Blinds', 'Other Home & Living' ),
            ),
            'appliances' => array(
                'name' => 'Appliances',
                'children' => array( 'Kitchen Appliances', 'Small Appliances', 'Laundry', 'Vacuums & Floor Care', 'Heating & Cooling', 'Refrigeration', 'Other Appliances' ),
            ),
            'beauty-personal-care' => array(
                'name' => 'Beauty & Personal Care',
                'children' => array( 'Skin Care', 'Hair Care', 'Makeup', 'Fragrance', 'Bath & Body', 'Nails', "Men's Grooming", 'Tools & Accessories', 'Oral Care', 'Other Beauty' ),
            ),
            'health-wellness' => array(
                'name' => 'Health & Wellness',
                'children' => array( 'Vitamins & Supplements', 'Personal Care', 'Medical Supplies', 'Fitness & Recovery', 'Mobility Aids', 'Sexual Wellness', 'Other Health' ),
            ),
            'sports-outdoors' => array(
                'name' => 'Sports & Outdoors',
                'children' => array( 'Exercise & Fitness', 'Cycling', 'Camping & Hiking', 'Hunting & Fishing', 'Team Sports', 'Water Sports', 'Winter Sports', 'Golf', 'Yoga', 'Other Sports' ),
            ),
            'automotive' => array(
                'name' => 'Automotive',
                'children' => array( 'Parts & Accessories', 'Tires & Wheels', 'Tools & Equipment', 'Car Care', 'Interior Accessories', 'Exterior Accessories', 'Motorcycle', 'RV & Trailer', 'Other Automotive' ),
            ),
            'tools-home-improvement' => array(
                'name' => 'Tools & Home Improvement',
                'children' => array( 'Power Tools', 'Hand Tools', 'Hardware', 'Plumbing', 'Electrical', 'Paint & Wall Treatments', 'Building Materials', 'Safety & Security', 'Other Tools' ),
            ),
            'garden-outdoor' => array(
                'name' => 'Garden & Outdoor',
                'children' => array( 'Plants & Seeds', 'Planters & Pots', 'Garden Tools', 'Outdoor Furniture', 'Grills & Outdoor Cooking', 'Lawn Care', 'Pest Control', 'Other Garden' ),
            ),
            'baby-kids' => array(
                'name' => 'Baby & Kids',
                'children' => array( 'Clothing', 'Nursery', 'Feeding', 'Diapering', 'Strollers & Car Seats', 'Toys', 'Blankets', 'Accessories', 'Gifts', 'Other Baby & Kids' ),
            ),
            'toys-games' => array(
                'name' => 'Toys & Games',
                'children' => array( 'Action Figures & Dolls', 'Building & Construction', 'Puzzles', 'Board Games', 'Video Games', 'Educational', 'Outdoor Play', 'Pretend Play', 'Stuffed Animals', 'Other Toys & Games' ),
            ),
            'pet-supplies' => array(
                'name' => 'Pet Supplies',
                'children' => array( 'Dog', 'Cat', 'Fish & Aquarium', 'Bird', 'Small Animal', 'Reptile', 'Pet Clothing', 'Beds & Furniture', 'Food & Treats', 'Toys', 'Other Pet Supplies' ),
            ),
            'books-media' => array(
                'name' => 'Books, Movies & Music',
                'children' => array( 'Books', 'E-Books & Audiobooks', 'Movies & TV', 'Music', 'Magazines', 'Other Media' ),
            ),
            'musical-instruments' => array(
                'name' => 'Musical Instruments',
                'children' => array( 'Guitars', 'Keyboards & Pianos', 'Drums & Percussion', 'Wind Instruments', 'Strings', 'DJ & Recording', 'Sheet Music', 'Accessories', 'Other Instruments' ),
            ),
            'office-school' => array(
                'name' => 'Office & School',
                'children' => array( 'Office Supplies', 'Furniture', 'Printers & Ink', 'Paper Products', 'Writing Instruments', 'School Supplies', 'Backpacks & Bags', 'Calendars & Planners', 'Other Office & School' ),
            ),
            'grocery-gourmet' => array(
                'name' => 'Grocery & Gourmet Food',
                'children' => array( 'Pantry Staples', 'Snacks', 'Beverages', 'Coffee & Tea', 'Candy & Chocolate', 'Baking', 'International Foods', 'Gift Baskets', 'Other Gourmet' ),
            ),
            'accessories' => array(
                'name' => 'Bags & Accessories',
                'children' => array( 'Handbags & Purses', 'Backpacks', 'Wallets', 'Belts', 'Hats & Caps', 'Scarves & Wraps', 'Gloves', 'Sunglasses', 'Hair Accessories', 'Keychains', 'Other Accessories' ),
            ),
            'luggage-travel' => array(
                'name' => 'Luggage & Travel',
                'children' => array( 'Suitcases', 'Duffel Bags', 'Travel Accessories', 'Backpacks', 'Garment Bags', 'Other Travel' ),
            ),
            'industrial-scientific' => array(
                'name' => 'Industrial & Scientific',
                'children' => array( 'Lab & Scientific', 'Material Handling', 'Janitorial & Sanitation', 'Packaging & Shipping', 'Safety Equipment', 'Test & Measurement', 'Other Industrial' ),
            ),
            'collectibles-antiques' => array(
                'name' => 'Collectibles & Antiques',
                'children' => array( 'Coins & Currency', 'Stamps', 'Trading Cards', 'Comics', 'Vintage', 'Memorabilia', 'Militaria', 'Fine Art', 'Other Collectibles' ),
            ),
            'arts-crafts' => array(
                'name' => 'Handmade & Crafts',
                'children' => array( 'Sewn & Textiles', 'Knitting & Crochet', 'Woodworking', 'Ceramics & Pottery', 'Painting & Drawing', 'Prints & Photography', 'Sculpture & Mixed Media', 'Paper & Stationery', 'Candles & Home Fragrance', 'Handmade Soap & Bath', 'Handmade Jewelry', 'Craft Supplies & Tools', 'Digital Downloads', 'Other Handmade' ),
            ),
            'seasonal-holiday' => array(
                'name' => 'Seasonal & Holiday',
                'children' => array( 'Christmas', 'Halloween', 'Easter', 'Thanksgiving', "Valentine's Day", "Mother's Day", "Father's Day", 'Independence Day', 'Hanukkah', 'Other Holidays' ),
            ),
            'personalized-gifts' => array(
                'name' => 'Personalized Gifts',
                'children' => array( 'Wedding', 'Anniversary', 'Birthday', 'Baby', 'Memorial', 'Graduation', 'Housewarming', 'Corporate Gifts', 'Other Personalized Gifts' ),
            ),
            'digital-products' => array(
                'name' => 'Digital Products',
                'children' => array( 'Software', 'Printable Art', 'Templates', 'Patterns', 'Invitations', 'Planners', 'Fonts & Graphics', 'Digital Downloads', 'Other Digital Products' ),
            ),
            // --- Legacy craft roots (kept so existing products remain valid) ---
            'sewing' => array(
                'name' => 'Sewing',
                'children' => array( "Men's Apparel", "Women's Apparel", "Children's Apparel", 'Baby Apparel', 'Bags & Purses', 'Accessories', 'Quilts & Blankets', 'Home Textiles', 'Other Sewing' ),
            ),
            'jewelry' => array(
                'name' => 'Jewelry',
                'children' => array( 'Necklaces', 'Earrings', 'Bracelets', 'Rings', 'Watches', 'Brooches & Pins', "Men's Jewelry", 'Other Jewelry' ),
            ),
            'woodworking' => array(
                'name' => 'Woodworking',
                'children' => array( 'Furniture', 'Home Décor', 'Kitchen & Dining', 'Signs', 'Toys', 'Boxes & Storage', 'Outdoor', 'Other Woodworking' ),
            ),
            'art' => array(
                'name' => 'Art',
                'children' => array( 'Paintings', 'Drawings', 'Prints', 'Photography', 'Sculpture', 'Mixed Media', 'Other Art' ),
            ),
            'paper-stationery' => array(
                'name' => 'Paper & Stationery',
                'children' => array( 'Cards', 'Invitations', 'Journals', 'Stickers', 'Calendars', 'Scrapbooking', 'Other Paper & Stationery' ),
            ),
            'knitting-crochet' => array(
                'name' => 'Knitting & Crochet',
                'children' => array( 'Clothing', 'Hats', 'Scarves', 'Blankets', 'Baby Items', 'Toys', 'Home Décor', 'Other Knitting & Crochet' ),
            ),
            'candles-home-fragrance' => array(
                'name' => 'Candles & Home Fragrance',
                'children' => array( 'Candles', 'Wax Melts', 'Diffusers', 'Incense', 'Candle Holders', 'Other Home Fragrance' ),
            ),
            'bath-body' => array(
                'name' => 'Bath & Body',
                'children' => array( 'Soap', 'Bath Products', 'Skin Care', 'Hair Care', 'Grooming', 'Other Bath & Body' ),
            ),
            'craft-supplies' => array(
                'name' => 'Craft Supplies',
                'children' => array( 'Fabric', 'Yarn', 'Beads', 'Patterns', 'Tools', 'Findings', 'Kits', 'Other Craft Supplies' ),
            ),
        );
    }

    private static function ensure_term( string $name, string $slug, int $parent ): int {
        $existing = get_term_by( 'slug', $slug, 'product_cat' );
        if ( $existing instanceof WP_Term ) {
            if ( (int) $existing->parent !== $parent ) {
                $updated = wp_update_term( $existing->term_id, 'product_cat', array( 'parent' => $parent ) );
                if ( is_wp_error( $updated ) ) {
                    return 0;
                }
            }
            return (int) $existing->term_id;
        }

        $created = wp_insert_term( $name, 'product_cat', array( 'slug' => $slug, 'parent' => $parent ) );
        return is_wp_error( $created ) ? 0 : (int) $created['term_id'];
    }

    public static function validate_and_normalize_requests( $response, WP_REST_Server $server, WP_REST_Request $request ) {
        $route  = untrailingslashit( $request->get_route() );
        $method = strtoupper( $request->get_method() );

        if ( in_array( $method, array( 'POST', 'PUT', 'PATCH' ), true )
            && preg_match( '#^/the-nest/v1/seller/products(?:/\d+)?$#', $route ) ) {
            $status = sanitize_key( (string) $request->get_param( 'status' ) );
            if ( 'draft' !== $status && null !== $request->get_param( 'category_ids' ) ) {
                $normalized = self::normalize_category_ids( $request->get_param( 'category_ids' ) );
                if ( is_wp_error( $normalized ) ) {
                    return $normalized;
                }
                $request->set_param( 'category_ids', $normalized );
            } elseif ( 'POST' === $method && 'draft' !== $status && null === $request->get_param( 'category_ids' ) ) {
                return new WP_Error( 'category_path_required', 'Choose one product category and sub-category before publishing.', array( 'status' => 422 ) );
            }
        }

        if ( 'POST' === $method && '/the-nest/v1/seller/application' === $route ) {
            $selections = self::application_selections_from_request( $request );
            if ( is_wp_error( $selections ) ) {
                return $selections;
            }
            if ( ! empty( $selections ) ) {
                $request->set_param( 'category_selections', $selections );
                if ( ! trim( (string) $request->get_param( 'products' ) ) ) {
                    $request->set_param( 'products', self::selection_labels( $selections ) );
                }
            }
        }

        return $response;
    }

    private static function normalize_category_ids( $value ) {
        if ( is_string( $value ) ) {
            $decoded = json_decode( $value, true );
            if ( is_array( $decoded ) ) {
                $value = $decoded;
            }
        }

        $ids = array_values( array_unique( array_filter( array_map( 'absint', (array) $value ) ) ) );
        if ( empty( $ids ) ) {
            return new WP_Error( 'category_path_required', 'Choose one product category and sub-category before publishing.', array( 'status' => 422 ) );
        }

        $terms = array();
        foreach ( $ids as $id ) {
            $term = get_term( $id, 'product_cat' );
            if ( ! $term instanceof WP_Term ) {
                return new WP_Error( 'invalid_product_category', 'One or more product categories are invalid.', array( 'status' => 422 ) );
            }
            $terms[ $id ] = $term;
        }

        $root_ids  = array();
        $child_ids = array();
        foreach ( $terms as $id => $term ) {
            if ( 0 === (int) $term->parent ) {
                $root_ids[] = (int) $id;
            } else {
                $child_ids[] = (int) $id;
            }
        }

        // Website compatibility: if only a child is submitted, include its root automatically.
        if ( empty( $root_ids ) && 1 === count( $child_ids ) ) {
            $child  = $terms[ $child_ids[0] ];
            $parent = get_term( (int) $child->parent, 'product_cat' );
            if ( $parent instanceof WP_Term && 0 === (int) $parent->parent ) {
                $root_ids[] = (int) $parent->term_id;
                $terms[ $parent->term_id ] = $parent;
            }
        }

        if ( 1 !== count( $root_ids ) ) {
            return new WP_Error( 'single_primary_category_required', 'Choose exactly one major product category.', array( 'status' => 422 ) );
        }

        $root_id = (int) $root_ids[0];
        $valid_children = array_values( array_filter( $child_ids, static function ( int $child_id ) use ( $terms, $root_id ): bool {
            return isset( $terms[ $child_id ] ) && (int) $terms[ $child_id ]->parent === $root_id;
        } ) );

        if ( count( $valid_children ) !== count( $child_ids ) ) {
            return new WP_Error( 'invalid_category_path', 'The selected sub-category must belong to the selected major category.', array( 'status' => 422 ) );
        }

        $has_children = ! empty( get_terms( array(
            'taxonomy' => 'product_cat', 'parent' => $root_id, 'hide_empty' => false, 'fields' => 'ids', 'number' => 1,
        ) ) );

        if ( $has_children && 1 !== count( $valid_children ) ) {
            return new WP_Error( 'subcategory_required', 'Choose exactly one sub-category under the selected product category.', array( 'status' => 422 ) );
        }
        if ( count( $valid_children ) > 1 ) {
            return new WP_Error( 'single_subcategory_required', 'Choose exactly one sub-category for this product.', array( 'status' => 422 ) );
        }

        return $valid_children ? array( $root_id, (int) $valid_children[0] ) : array( $root_id );
    }

    private static function application_selections_from_request( WP_REST_Request $request ) {
        $raw = $request->get_param( 'category_selections' );
        if ( is_string( $raw ) ) {
            $decoded = json_decode( $raw, true );
            if ( is_array( $decoded ) ) {
                $raw = $decoded;
            }
        }

        if ( is_array( $raw ) && ! empty( $raw ) ) {
            $selections = array();
            foreach ( $raw as $row ) {
                if ( ! is_array( $row ) ) {
                    continue;
                }
                $ids = self::normalize_category_ids( array( absint( $row['category_id'] ?? 0 ), absint( $row['subcategory_id'] ?? 0 ) ) );
                if ( is_wp_error( $ids ) ) {
                    return $ids;
                }
                $selections[] = array( 'category_id' => (int) $ids[0], 'subcategory_id' => isset( $ids[1] ) ? (int) $ids[1] : 0 );
            }
            return self::unique_selections( $selections );
        }

        // Current app compatibility: products contains one "Category > Sub-category" path per line.
        $products = trim( (string) $request->get_param( 'products' ) );
        if ( '' === $products ) {
            return array();
        }

        $selections = array();
        foreach ( preg_split( '/\r\n|\r|\n/', $products ) as $line ) {
            $parts = array_values( array_filter( array_map( 'trim', preg_split( '/\s*>\s*/', $line ) ) ) );
            if ( count( $parts ) < 1 || count( $parts ) > 2 ) {
                continue;
            }
            $root = get_term_by( 'name', $parts[0], 'product_cat' );
            if ( ! $root instanceof WP_Term || 0 !== (int) $root->parent ) {
                continue;
            }

            $child_id = 0;
            if ( isset( $parts[1] ) ) {
                $children = get_terms( array( 'taxonomy' => 'product_cat', 'parent' => (int) $root->term_id, 'hide_empty' => false, 'name' => $parts[1], 'number' => 1 ) );
                if ( ! is_wp_error( $children ) && ! empty( $children ) && $children[0] instanceof WP_Term ) {
                    $child_id = (int) $children[0]->term_id;
                }
            }

            $ids = self::normalize_category_ids( array( (int) $root->term_id, $child_id ) );
            if ( is_wp_error( $ids ) ) {
                return $ids;
            }
            $selections[] = array( 'category_id' => (int) $ids[0], 'subcategory_id' => isset( $ids[1] ) ? (int) $ids[1] : 0 );
        }

        return self::unique_selections( $selections );
    }

    private static function unique_selections( array $selections ): array {
        $unique = array();
        foreach ( $selections as $selection ) {
            $category_id = absint( $selection['category_id'] ?? 0 );
            $subcategory_id = absint( $selection['subcategory_id'] ?? 0 );
            if ( $category_id ) {
                $unique[ $category_id . ':' . $subcategory_id ] = array( 'category_id' => $category_id, 'subcategory_id' => $subcategory_id );
            }
        }
        return array_values( $unique );
    }

    public static function persist_application_categories( $response, $handler, WP_REST_Request $request ) {
        if ( '/the-nest/v1/seller/application' !== untrailingslashit( $request->get_route() ) || 'POST' !== strtoupper( $request->get_method() ) || is_wp_error( $response ) ) {
            return $response;
        }

        $response_object = rest_ensure_response( $response );
        if ( $response_object->get_status() >= 400 ) {
            return $response;
        }

        $selections = $request->get_param( 'category_selections' );
        $user_id = get_current_user_id();
        if ( $user_id > 0 && is_array( $selections ) && ! empty( $selections ) ) {
            update_user_meta( $user_id, self::APPLICATION_META, self::unique_selections( $selections ) );
        }
        return $response;
    }

    public static function enrich_responses( $response, WP_REST_Server $server, WP_REST_Request $request ) {
        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $route = untrailingslashit( $request->get_route() );
        $response_object = rest_ensure_response( $response );
        $data = $response_object->get_data();

        if ( '/the-nest/v1/categories' === $route && is_array( $data ) ) {
            foreach ( $data as &$row ) {
                if ( is_array( $row ) && ! empty( $row['id'] ) ) {
                    $term = get_term( absint( $row['id'] ), 'product_cat' );
                    if ( $term instanceof WP_Term ) {
                        $row['parent'] = (int) $term->parent;
                    }
                }
            }
            unset( $row );
            $response_object->set_data( $data );
            return $response_object;
        }

        if ( '/the-nest/v1/admin/seller-applications' === $route && is_array( $data ) && isset( $data['items'] ) && is_array( $data['items'] ) ) {
            foreach ( $data['items'] as &$item ) {
                if ( ! is_array( $item ) ) {
                    continue;
                }
                $user_id = absint( $item['seller_id'] ?? $item['user_id'] ?? $item['applicant_id'] ?? 0 );
                if ( ! $user_id && ! empty( $item['seller_email'] ) ) {
                    $user = get_user_by( 'email', sanitize_email( $item['seller_email'] ) );
                    if ( $user instanceof WP_User ) {
                        $user_id = (int) $user->ID;
                    }
                }
                if ( ! $user_id ) {
                    continue;
                }
                $selections = get_user_meta( $user_id, self::APPLICATION_META, true );
                if ( is_array( $selections ) && ! empty( $selections ) ) {
                    $item['category_selections'] = self::unique_selections( $selections );
                    $item['categories'] = self::selection_labels( $item['category_selections'] );
                }
            }
            unset( $item );
            $response_object->set_data( $data );
            return $response_object;
        }

        return $response;
    }

    private static function selection_labels( array $selections ): string {
        $labels = array();
        foreach ( $selections as $selection ) {
            $root = get_term( absint( $selection['category_id'] ?? 0 ), 'product_cat' );
            if ( ! $root instanceof WP_Term ) {
                continue;
            }
            $label = $root->name;
            $child_id = absint( $selection['subcategory_id'] ?? 0 );
            if ( $child_id ) {
                $child = get_term( $child_id, 'product_cat' );
                if ( $child instanceof WP_Term && (int) $child->parent === (int) $root->term_id ) {
                    $label .= ' > ' . $child->name;
                }
            }
            $labels[] = $label;
        }
        return implode( "\n", array_values( array_unique( $labels ) ) );
    }
}

MNU_Category_Taxonomy_Compat::boot();

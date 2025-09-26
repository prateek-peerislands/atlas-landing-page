import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Eye, X, Database, Users, Package, ShoppingCart, UserCheck, CreditCard } from "lucide-react";

interface ClusterData {
  users: Array<{
    _id: string;
    name: string;
    email: string;
    age: number;
    city: string;
    createdAt: string;
  }>;
  products: Array<{
    _id: string;
    name: string;
    category: string;
    price: number;
    stock: number;
    brand: string;
    createdAt: string;
  }>;
  orders: Array<{
    _id: string;
    userId: string;
    productId: string;
    quantity: number;
    total: number;
    status: string;
    orderDate: string;
  }>;
  customers: Array<{
    _id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    loyaltyPoints: number;
    createdAt: string;
  }>;
  transactions: Array<{
    _id: string;
    customerId: string;
    amount: number;
    type: string;
    status: string;
    timestamp: string;
  }>;
}

interface DataViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  clusterName: string;
  data: ClusterData;
}

export default function DataViewModal({ isOpen, onClose, clusterName, data }: DataViewModalProps) {
  const [activeTab, setActiveTab] = useState("users");

  // Safeguard: ensure all collections are arrays to avoid runtime errors
  const safeData = {
    users: data?.users || [],
    products: data?.products || [],
    orders: data?.orders || [],
    customers: data?.customers || [],
    transactions: data?.transactions || []
  };

  // Log when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log('🖼️ [DATA-MODAL] Modal opened for cluster:', clusterName);
      console.log('📊 [DATA-MODAL] Data structure:', {
        usersCount: safeData.users.length,
        productsCount: safeData.products.length,
        ordersCount: safeData.orders.length,
        customersCount: safeData.customers.length,
        transactionsCount: safeData.transactions.length
      });
    } else {
      console.log('🖼️ [DATA-MODAL] Modal closed');
    }
  }, [isOpen, clusterName, data]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'shipped':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-mongodb-green" />
            <span>Cluster Data: {clusterName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={(value) => {
            console.log('📑 [DATA-MODAL] Tab changed from', activeTab, 'to', value);
            setActiveTab(value);
          }} className="h-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="users" className="flex items-center space-x-2">
                <Users className="w-4 h-4" />
                <span>Users ({safeData.users.length})</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="flex items-center space-x-2">
                <Package className="w-4 h-4" />
                <span>Products ({safeData.products.length})</span>
              </TabsTrigger>
              <TabsTrigger value="orders" className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4" />
                <span>Orders ({safeData.orders.length})</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="flex items-center space-x-2">
                <UserCheck className="w-4 h-4" />
                <span>Customers ({safeData.customers.length})</span>
              </TabsTrigger>
              <TabsTrigger value="transactions" className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4" />
                <span>Transactions ({safeData.transactions.length})</span>
              </TabsTrigger>
            </TabsList>

            <div className="mt-4 h-[calc(100%-4rem)] overflow-auto">
              <TabsContent value="users" className="space-y-4">
                <div className="grid gap-4">
                  {safeData.users.map((user) => (
                    <div key={user._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">{user.name}</h4>
                          <p className="text-gray-600">{user.email}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Age: {user.age}</span>
                            <span>City: {user.city}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {formatDate(user.createdAt)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="products" className="space-y-4">
                <div className="grid gap-4">
                  {safeData.products.map((product) => (
                    <div key={product._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">{product.name}</h4>
                          <p className="text-gray-600">{product.brand}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Category: {product.category}</span>
                            <span>Stock: {product.stock}</span>
                            <span className="font-semibold text-green-600">${product.price}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {formatDate(product.createdAt)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="orders" className="space-y-4">
                <div className="grid gap-4">
                  {safeData.orders.map((order) => (
                    <div key={order._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">Order #{order._id}</h4>
                          <p className="text-gray-600">User: {order.userId} | Product: {order.productId}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Quantity: {order.quantity}</span>
                            <span className="font-semibold text-green-600">Total: ${order.total}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <Badge className={getStatusColor(order.status)}>
                            {order.status}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {formatDate(order.orderDate)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="customers" className="space-y-4">
                <div className="grid gap-4">
                  {safeData.customers.map((customer) => (
                    <div key={customer._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">{customer.name}</h4>
                          <p className="text-gray-600">{customer.email}</p>
                          <p className="text-gray-500 text-sm">{customer.phone}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Address: {customer.address}</span>
                            <span className="font-semibold text-green-600">Points: {customer.loyaltyPoints}</span>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {formatDate(customer.createdAt)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="transactions" className="space-y-4">
                <div className="grid gap-4">
                  {safeData.transactions.map((transaction) => (
                    <div key={transaction._id} className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">Transaction #{transaction._id}</h4>
                          <p className="text-gray-600">Customer: {transaction.customerId}</p>
                          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                            <span>Type: {transaction.type}</span>
                            <span className="font-semibold text-green-600">Amount: ${transaction.amount}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end space-y-2">
                          <Badge className={getStatusColor(transaction.status)}>
                            {transaction.status}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {formatDate(transaction.timestamp)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div class="card p-6 border-l-4 border-gold-500">
        <p class="text-gray-500 text-sm font-semibold uppercase">Total Revenue</p>
        <h3 class="text-2xl font-bold text-diamond-900">$128,450</h3>
        <p class="text-green-600 text-sm mt-1">↑ 12% vs last week</p>
      </div>
      <div class="card p-6 border-l-4 border-blue-500">
        <p class="text-gray-500 text-sm font-semibold uppercase">Total Orders</p>
        <h3 class="text-2xl font-bold text-diamond-900">1,245</h3>
        <p class="text-green-600 text-sm mt-1">↑ 5% vs last week</p>
      </div>
      <div class="card p-6 border-l-4 border-purple-500">
        <p class="text-gray-500 text-sm font-semibold uppercase">Active Customers</p>
        <h3 class="text-2xl font-bold text-diamond-900">892</h3>
        <p class="text-gray-500 text-sm mt-1">Steady</p>
      </div>
      <div class="card p-6 border-l-4 border-red-500">
        <p class="text-gray-500 text-sm font-semibold uppercase">Low Stock Alerts</p>
        <h3 class="text-2xl font-bold text-diamond-900">12</h3>
        <p class="text-red-600 text-sm mt-1">Action required</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <!-- Revenue Chart (Mock) -->
      <div class="card p-6">
        <h3 class="text-lg font-bold text-diamond-900 mb-4">Weekly Revenue</h3>
        <div class="h-64 flex items-end justify-between gap-2">
          <div class="w-full bg-gold-100 rounded-t relative group" style="height: 40%">
            <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$12k</div>
          </div>
          <div class="w-full bg-gold-200 rounded-t relative group" style="height: 65%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$18k</div>
          </div>
          <div class="w-full bg-gold-300 rounded-t relative group" style="height: 50%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$15k</div>
          </div>
          <div class="w-full bg-gold-400 rounded-t relative group" style="height: 80%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$24k</div>
          </div>
          <div class="w-full bg-gold-500 rounded-t relative group" style="height: 60%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$18k</div>
          </div>
          <div class="w-full bg-gold-600 rounded-t relative group" style="height: 90%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$28k</div>
          </div>
          <div class="w-full bg-gold-700 rounded-t relative group" style="height: 75%">
             <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">$22k</div>
          </div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
      </div>

      <!-- Top Categories -->
      <div class="card p-6">
        <h3 class="text-lg font-bold text-diamond-900 mb-4">Top Selling Categories</h3>
        <div class="space-y-4">
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Engagement Rings</span>
              <span class="font-semibold">45%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
              <div class="bg-rose-500 h-2 rounded-full" style="width: 45%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Loose Diamonds</span>
              <span class="font-semibold">25%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
              <div class="bg-blue-500 h-2 rounded-full" style="width: 25%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Gemstone Jewelry</span>
              <span class="font-semibold">20%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
              <div class="bg-purple-500 h-2 rounded-full" style="width: 20%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span>Gold & Platinum</span>
              <span class="font-semibold">10%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-2">
              <div class="bg-yellow-500 h-2 rounded-full" style="width: 10%"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Orders Table -->
    <div class="card overflow-hidden">
      <div class="p-6 border-b border-gray-100 flex justify-between items-center">
        <h3 class="text-lg font-bold text-diamond-900">Recent Orders</h3>
        <button class="text-gold-600 text-sm font-semibold hover:text-gold-700">View All</button>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left">
          <thead class="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th class="px-6 py-3 font-semibold">Order ID</th>
              <th class="px-6 py-3 font-semibold">Customer</th>
              <th class="px-6 py-3 font-semibold">Product</th>
              <th class="px-6 py-3 font-semibold">Amount</th>
              <th class="px-6 py-3 font-semibold">Status</th>
              <th class="px-6 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4 text-sm text-gray-900 font-medium">#ORD-001</td>
              <td class="px-6 py-4 text-sm text-gray-600">Sarah Jenkins</td>
              <td class="px-6 py-4 text-sm text-gray-600">1.5 Carat Diamond...</td>
              <td class="px-6 py-4 text-sm text-gray-900 font-bold">$45,000</td>
              <td class="px-6 py-4">
                <span class="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Processing</span>
              </td>
              <td class="px-6 py-4">
                <button class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
              </td>
            </tr>
            <tr class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4 text-sm text-gray-900 font-medium">#ORD-002</td>
              <td class="px-6 py-4 text-sm text-gray-600">Michael Chen</td>
              <td class="px-6 py-4 text-sm text-gray-600">Platinum Band</td>
              <td class="px-6 py-4 text-sm text-gray-900 font-bold">$2,500</td>
              <td class="px-6 py-4">
                <span class="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">Shipped</span>
              </td>
              <td class="px-6 py-4">
                <button class="text-blue-600 hover:text-blue-800 text-sm">View</button>
              </td>
            </tr>
            <tr class="hover:bg-gray-50 transition-colors">
              <td class="px-6 py-4 text-sm text-gray-900 font-medium">#ORD-003</td>
              <td class="px-6 py-4 text-sm text-gray-600">Emma Watson</td>
              <td class="px-6 py-4 text-sm text-gray-600">Emerald Earrings</td>
              <td class="px-6 py-4 text-sm text-gray-900 font-bold">$12,000</td>
              <td class="px-6 py-4">
                <span class="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Delivered</span>
              </td>
              <td class="px-6 py-4">
                <button class="text-blue-600 hover:text-blue-800 text-sm">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class AdminDashboardComponent {}
